import cors from "cors";
import express from "express";
import { z } from "zod";
import { WebSocketServer } from "ws";
import { createServer } from "http";

import { pool, waitForDB } from "./db.js";
import { state, wsClients } from "./state.js";
import { mqttClient, MQTT_CONTROL_TOPIC } from "./mqtt.js";
import {
  loessSmooth,
  estimateRecentTrend,
  holtWinters,
  predictionErrorMetrics,
  aggregateBySampleWindow,
  adaptiveRegression,
  pearsonCorr,
} from "./predict.js";

const app = express();
const port = process.env.PORT || 3100;

app.use(cors());
app.use(express.json());

// --- Schemas ---
const loginSchema = z.object({ email: z.string().email(), password: z.string().min(6) });
const alertSettingsSchema = z.object({
  level1: z.number().int().min(400).max(5000),
  level2: z.number().int().min(400).max(5000),
  notifications: z.boolean(),
});
const controlSchema = z.object({
  target: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

// --- API Key auth ---
const API_KEY = process.env.API_KEY || "co2-demo-key-2026";

function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) return res.status(401).json({ error: "Invalid API key" });
  next();
}

// --- REST Endpoints ---
app.get("/api/v1/health", (_req, res) => {
  res.json({ ok: true, mqtt: mqttClient.connected, lastHeartbeat: state.lastHeartbeat });
});

app.post("/api/v1/auth/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  res.json({ token: "demo-token", user: { id: "demo-user", name: "刘高朋", email: "demo@cloude.app" } });
});

app.get("/api/v1/auth/me", (_req, res) => {
  res.json({ id: "demo-user", name: "刘高朋", email: "demo@cloude.app" });
});

app.get("/api/v1/realtime/co2", async (_req, res) => {
  if (!state.latestData) {
    const { rows } = await pool.query(
      "SELECT ts, co2, temperature, humidity, alarm, slope, eta, trend, device FROM readings ORDER BY id DESC LIMIT 1"
    );
    const latest = rows[0];
    if (!latest) return res.json({ data: null, online: false });
    return res.json({
      data: {
        co2: latest.co2,
        temp: latest.temperature,
        hum: latest.humidity,
        alarm: latest.alarm,
        slope: latest.slope,
        eta: latest.eta,
        trend: latest.trend,
        dev: latest.device,
        ts: latest.ts,
      },
      online: false,
    });
  }
  const online = Date.now() - state.lastHeartbeat < 15000;
  res.json({ data: state.latestData, online });
});

app.get("/api/v1/weather/compare", async (_req, res) => {
  const indoor = state.latestData || {};
  const outdoor = await fetchOutdoorWeather();
  const online = Date.now() - state.lastHeartbeat < 15000;
  const result = {
    indoor: {
      co2: indoor.co2 || 0,
      temp: indoor.temp || 0,
      hum: indoor.hum || 0,
      bssid: indoor.bssid || "",
      online,
    },
    outdoor: outdoor || { error: "WEATHER_API_KEY not configured" },
    comparison: null,
  };
  if (outdoor && indoor.temp !== undefined) {
    result.comparison = {
      temp_diff: Math.round((indoor.temp - outdoor.temp) * 10) / 10,
      hum_diff: Math.round((indoor.hum - outdoor.humidity) * 10) / 10,
      ventilation_advice: getVentilationAdvice(indoor, outdoor),
    };
  }
  res.json(result);
});

// --- Weather comparison (uses sojson free API, China-accessible, no key needed) ---
const DEVICE_CITY_CODE = process.env.DEVICE_CITY_CODE || "101020100"; // Shanghai

async function fetchOutdoorWeather() {
  const url = `http://t.weather.sojson.com/api/weather/city/${DEVICE_CITY_CODE}`;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const json = await resp.json();
    if (json.status !== 200 || !json.data) return null;
    const d = json.data;
    const today = d.forecast && d.forecast[0];
    return {
      temp: parseFloat(d.wendu),
      humidity: parseInt(d.shidu),
      text: today ? today.type : "",
      feelsLike: parseFloat(d.wendu),
      pm25: d.pm25,
      quality: d.quality,
    };
  } catch { /* timeout or network error */ }
  return null;
}

function getVentilationAdvice(indoor, outdoor) {
  if (indoor.co2 >= 1500) return "CO2 危险，立即开窗通风";
  if (indoor.co2 >= 1000 && outdoor.temp >= 5 && outdoor.temp <= 35)
    return "CO2 偏高，建议开窗通风";
  if (indoor.co2 >= 1000 && (outdoor.temp < 5 || outdoor.temp > 35))
    return "CO2 偏高，但室外温度极端，建议短时通风";
  if (indoor.temp - outdoor.temp > 10)
    return "室内外温差大，通风时注意保暖";
  return "空气质量正常";
}

app.get("/api/v1/history/co2", async (req, res) => {
  const range = req.query.range || "1h";
  const rangeMap = { "1h": 720, "6h": 4320, "24h": 17280, "7d": 120960 };
  const limit = rangeMap[range] || 720;
  const { rows } = await pool.query(
    "SELECT ts, co2, temperature, humidity, alarm, slope, eta, trend FROM readings ORDER BY id DESC LIMIT $1",
    [limit]
  );
  rows.reverse();
  res.json({ range, count: rows.length, points: rows });
});

// --- Fitted curve: smoothed history + recent-trend forecast extension ---
app.get("/api/v1/fitted/co2", async (req, res) => {
  const range = req.query.range || "1h";
  const rangeMap = { "1h": 720, "6h": 4320, "24h": 17280, "7d": 120960 };
  const limit = rangeMap[range] || 720;
  const forecastMin = parseInt(req.query.forecast) || 30;
  const { rows } = await pool.query(
    "SELECT ts, co2 FROM readings ORDER BY id DESC LIMIT $1",
    [limit]
  );
  rows.reverse();
  if (rows.length < 3) {
    return res.json({ range, fitted: [], forecast: [], model: null });
  }
  const values = rows.map((r) => r.co2);
  const n = values.length;
  const fittedValues = loessSmooth(values, 0.18);
  fittedValues[n - 1] = values[n - 1];
  const fitted = rows.map((r, i) => ({
    ts: r.ts,
    co2: Math.round(fittedValues[i]),
  }));
  const lastTs = new Date(rows[n - 1].ts).getTime();
  const interval = n > 1
    ? (new Date(rows[n - 1].ts).getTime() - new Date(rows[0].ts).getTime()) / (n - 1)
    : 5000;
  const forecastPoints = Math.round((forecastMin * 60 * 1000) / interval);
  const trendPerSample = estimateRecentTrend(values, rows);
  const forecast = [];
  for (let i = 1; i <= forecastPoints; i++) {
    const ts = new Date(lastTs + i * interval).toISOString();
    const damping = Math.pow(0.94, i - 1);
    forecast.push({ ts, co2: Math.round(values[n - 1] + trendPerSample * i * damping) });
  }
  res.json({
    range,
    count: rows.length,
    model: {
      type: "loess",
      bandwidth: 0.18,
      trend_per_sample: Math.round(trendPerSample * 1000) / 1000
    },
    fitted,
    forecast,
  });
});

// --- CO2 Prediction Endpoint (multi-variable fusion) ---
app.get("/api/v1/predict/co2", async (_req, res) => {
  try {
    let dataFreshness = "live_5min";
    let { rows } = await pool.query(
      "SELECT co2, temperature, humidity FROM readings WHERE ts > NOW() - INTERVAL '5 minutes' ORDER BY ts ASC"
    );

    if (rows.length < 10) {
      dataFreshness = "latest_history";
      const latest = await pool.query(
        "SELECT co2, temperature, humidity FROM readings ORDER BY id DESC LIMIT 300"
      );
      rows = latest.rows.reverse();
    }

    if (rows.length < 2) {
      return res.json({
        current: state.latestData?.co2 ?? null,
        filtered: state.latestData?.co2 ?? null,
        slope: 0,
        accel: 0,
        confidence: 0,
        trend: "insufficient_data",
        model: "none",
        correlation: { co2_temp: 0, co2_hum: 0 },
        env_factor: 0,
        error: { mae: null, rmse: null, samples: 0, basis: "rolling_1min_backtest" },
        prediction: { points: [], eta_warning: null, eta_alarm: null },
        algorithm: "adaptive_regression + multi_variable_fusion + holt_winters",
        data_freshness: "insufficient_data",
        samples: rows.length,
      });
    }

    const co2Data = rows.map((r) => r.co2);
    const tempData = rows.map((r) => r.temperature);
    const humData = rows.map((r) => r.humidity);
    const current = co2Data[co2Data.length - 1];

    // EWMA filter
    let filtered = co2Data[0];
    for (let i = 1; i < co2Data.length; i++) {
      filtered = 0.3 * co2Data[i] + 0.7 * filtered;
    }
    filtered = Math.round(filtered);

    // Adaptive regression on 5-min CO2 window
    const intervalSec = 5;
    const reg = adaptiveRegression(co2Data);
    const slopePerMin = reg.slope * (60 / intervalSec);
    const accelPerMin2 = reg.accel * (3600 / (intervalSec * intervalSec));

    // Multi-variable correlation
    const co2TempCorr = pearsonCorr(co2Data, tempData);
    const co2HumCorr = pearsonCorr(co2Data, humData);

    // Environment support factor (0-100)
    let envFactor = 0;
    if (slopePerMin > 0) {
      const tempReg = adaptiveRegression(tempData);
      const humReg = adaptiveRegression(humData);
      if (tempReg.slope > 0) envFactor += 25;
      if (humReg.slope > 0) envFactor += 25;
      if (co2TempCorr > 0.5) envFactor += 25;
      if (co2HumCorr > 0.5) envFactor += 25;
    } else if (slopePerMin < 0) {
      const tempReg = adaptiveRegression(tempData);
      const humReg = adaptiveRegression(humData);
      if (tempReg.slope < 0) envFactor += 25;
      if (humReg.slope < 0) envFactor += 25;
      if (co2TempCorr > 0.5) envFactor += 25;
      if (co2HumCorr > 0.5) envFactor += 25;
    }

    // Confidence: blend R² with env support
    const rawConf = Math.round(reg.r2 * 100);
    const confidence = Math.min(100, rawConf + Math.round(envFactor * 0.2));

    // Trend label
    let trendLabel = "stable";
    if (slopePerMin > 2 && (accelPerMin2 > 0.5 || envFactor >= 50)) trendLabel = "accelerating";
    else if (slopePerMin > 1) trendLabel = "rising";
    else if (slopePerMin < -2 && envFactor >= 50) trendLabel = "falling_fast";
    else if (slopePerMin < -1) trendLabel = "falling";

    // Holt-Winters prediction on 1-min averages
    const perMin = Math.round(60 / intervalSec);
    const minuteData = aggregateBySampleWindow(co2Data, perMin);
    const predictions = holtWinters(minuteData, 0.4, 0.15, 30);
    const errorRows = await pool.query(
      "SELECT co2 FROM readings ORDER BY id DESC LIMIT 720"
    );
    const errorCo2Data = errorRows.rows.reverse().map((r) => r.co2);
    const errorMinuteData = aggregateBySampleWindow(errorCo2Data, perMin);
    const error = predictionErrorMetrics(errorMinuteData);

    const points = predictions.map((v, i) => ({ t: `+${i + 1}min`, co2: v }));

    let etaWarning = null, etaAlarm = null;
    for (let i = 0; i < predictions.length; i++) {
      if (etaWarning === null && predictions[i] >= 1000) etaWarning = (i + 1) * 60;
      if (etaAlarm === null && predictions[i] >= 1500) etaAlarm = (i + 1) * 60;
    }

    res.json({
      current,
      filtered,
      slope: Math.round(slopePerMin * 10) / 10,
      accel: Math.round(accelPerMin2 * 10) / 10,
      confidence,
      trend: trendLabel,
      model: reg.model,
      correlation: {
        co2_temp: Math.round(co2TempCorr * 100) / 100,
        co2_hum: Math.round(co2HumCorr * 100) / 100,
      },
      env_factor: envFactor,
      error,
      prediction: { points, eta_warning: etaWarning, eta_alarm: etaAlarm },
      algorithm: "adaptive_regression + multi_variable_fusion + holt_winters",
      data_freshness: dataFreshness,
      samples: rows.length,
    });
  } catch (e) {
    console.error("predict error:", e.message);
    res.status(500).json({ error: "Prediction failed" });
  }
});

app.get("/api/v1/devices", (_req, res) => {
  const online = Date.now() - state.lastHeartbeat < 15000;
  res.json({ items: [
    { id: "co2-sensor-01", name: "CO2 检测终端", type: "SCD41 + STM32", isOnline: online,
      currentValue: state.latestData?.co2 || 0, unit: "ppm", lastSeen: state.latestData?.ts },
  ]});
});

app.get("/api/v1/alerts", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM alerts ORDER BY id DESC LIMIT 50");
  res.json({ items: rows });
});

app.get("/api/v1/analytics/co2-alert-settings", (_req, res) => res.json(state.alertSettings));

app.put("/api/v1/analytics/co2-alert-settings", requireApiKey, (req, res) => {
  const parsed = alertSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  state.alertSettings = parsed.data;
  res.json(state.alertSettings);
});

// --- Control Endpoint (publish to MQTT) ---
app.post("/api/v1/control", requireApiKey, (req, res) => {
  const parsed = controlSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { target, value } = parsed.data;
  const payload = JSON.stringify({ target, value, ts: Date.now() });
  mqttClient.publish(MQTT_CONTROL_TOPIC, payload, { qos: 1 }, (err) => {
    if (err) return res.status(500).json({ error: "MQTT publish failed" });
    res.json({ ok: true, topic: MQTT_CONTROL_TOPIC, payload: { target, value } });
  });
});

app.get("/api/v1/public/co2/current", requireApiKey, (_req, res) => {
  res.json({ data: state.latestData, online: Date.now() - state.lastHeartbeat < 15000 });
});

app.get("/api/v1/public/co2/history", requireApiKey, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const { rows } = await pool.query(
    "SELECT ts, co2, temperature, humidity FROM readings ORDER BY id DESC LIMIT $1",
    [limit]
  );
  rows.reverse();
  res.json({ count: rows.length, points: rows });
});

app.get("/api/v1/public/device/status", requireApiKey, (_req, res) => {
  res.json({
    device: "co2_001", online: Date.now() - state.lastHeartbeat < 15000,
    lastData: state.latestData, alertSettings: state.alertSettings,
  });
});

// --- OpenAPI Docs ---
app.get("/api/docs", (_req, res) => {
  res.json({
    openapi: "3.0.3",
    info: { title: "CO2 Monitor API", version: "1.0.0", description: "CO2 monitoring system API" },
    servers: [{ url: "/" }],
    paths: {
      "/api/v1/health": { get: { summary: "Health check", responses: { 200: { description: "OK" } } } },
      "/api/v1/auth/login": { post: { summary: "Demo account login", requestBody: { content: { "application/json": { schema: { type: "object", properties: { email: { type: "string", format: "email" }, password: { type: "string", minLength: 6 } }, required: ["email","password"] } } } }, responses: { 200: { description: "Token and user" }, 400: { description: "Validation error" } } } },
      "/api/v1/auth/me": { get: { summary: "Current demo user", responses: { 200: { description: "User info" } } } },
      "/api/v1/realtime/co2": { get: { summary: "Get latest CO2 reading", responses: { 200: { description: "Current data" } } } },
      "/api/v1/weather/compare": { get: { summary: "Indoor vs outdoor weather comparison and ventilation advice", responses: { 200: { description: "Comparison result" } } } },
      "/api/v1/history/co2": { get: { summary: "Get historical readings", parameters: [{ name: "range", in: "query", schema: { type: "string", enum: ["1h","6h","24h","7d"] } }], responses: { 200: { description: "Historical points" } } } },
      "/api/v1/fitted/co2": { get: { summary: "LOESS-smoothed history with recent-trend forecast extension", parameters: [{ name: "range", in: "query", schema: { type: "string", enum: ["1h","6h","24h","7d"] } }, { name: "forecast", in: "query", schema: { type: "integer" }, description: "forecast minutes" }], responses: { 200: { description: "Fitted and forecast points" } } } },
      "/api/v1/predict/co2": { get: { summary: "Multi-variable fusion prediction (adaptive regression + Holt-Winters)", responses: { 200: { description: "Prediction, confidence, correlation, error metrics, ETA" } } } },
      "/api/v1/devices": { get: { summary: "List devices", responses: { 200: { description: "Device list" } } } },
      "/api/v1/alerts": { get: { summary: "Get recent alerts", responses: { 200: { description: "Alert list" } } } },
      "/api/v1/analytics/co2-alert-settings": {
        get: { summary: "Get current alert thresholds", responses: { 200: { description: "Alert settings" } } },
        put: { summary: "Update alert thresholds", security: [{ ApiKey: [] }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { level1: { type: "integer", minimum: 400, maximum: 5000 }, level2: { type: "integer", minimum: 400, maximum: 5000 }, notifications: { type: "boolean" } }, required: ["level1","level2","notifications"] } } } }, responses: { 200: { description: "Updated settings" }, 400: { description: "Validation error" }, 401: { description: "Invalid API key" } } },
      },
      "/api/v1/control": { post: { summary: "Send control command via MQTT", security: [{ ApiKey: [] }], requestBody: { content: { "application/json": { schema: { type: "object", properties: { target: { type: "string" }, value: {} }, required: ["target","value"] } } } }, responses: { 200: { description: "Command sent" } } } },
      "/api/v1/public/co2/current": { get: { summary: "Public current CO2", security: [{ ApiKey: [] }], responses: { 200: { description: "Current data" } } } },
      "/api/v1/public/co2/history": { get: { summary: "Public history", security: [{ ApiKey: [] }], responses: { 200: { description: "Historical data" } } } },
      "/api/v1/public/device/status": { get: { summary: "Public device status", security: [{ ApiKey: [] }], responses: { 200: { description: "Device status" } } } },
    },
    components: { securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "x-api-key" } } },
  });
});

// --- HTTP + WebSocket Server ---
const server = createServer(app);
const wss = new WebSocketServer({ server, path: "/ws/realtime" });

wss.on("connection", (ws) => {
  wsClients.add(ws);
  if (state.latestData) ws.send(JSON.stringify({ type: "realtime", data: state.latestData }));
  ws.on("close", () => wsClients.delete(ws));
});

// --- Start ---
waitForDB().then(() => {
  server.listen(port, () => {
    console.log(`CO2 API listening on port ${port}`);
    console.log(`WebSocket at ws://localhost:${port}/ws/realtime`);
  });
}).catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});




