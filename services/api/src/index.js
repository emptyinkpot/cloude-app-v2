import cors from "cors";
import express from "express";
import { z } from "zod";
import mqtt from "mqtt";
import pg from "pg";
import { WebSocketServer } from "ws";
import { createServer } from "http";

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 3100;

app.use(cors());
app.use(express.json());

// --- Database Setup (PostgreSQL) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://co2api:co2secret2026@localhost:5432/co2_data",
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS readings (
      id SERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      co2 INTEGER NOT NULL,
      temperature REAL NOT NULL,
      humidity REAL NOT NULL,
      alarm INTEGER NOT NULL DEFAULT 0,
      slope INTEGER DEFAULT 0,
      eta INTEGER DEFAULT -1,
      trend INTEGER DEFAULT 0,
      device TEXT NOT NULL DEFAULT 'co2_001'
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id SERIAL PRIMARY KEY,
      ts TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      level INTEGER NOT NULL,
      co2 INTEGER NOT NULL,
      message TEXT NOT NULL
    );
  `);
}

// Retry DB connection on startup (postgres may not be ready yet)
async function waitForDB(retries = 10, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await initDB();
      console.log("PostgreSQL connected");
      return;
    } catch (err) {
      console.log(`DB not ready (attempt ${i + 1}/${retries}): ${err.message}`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("Could not connect to PostgreSQL after retries");
}

// --- State ---
let latestData = null;
let lastHeartbeat = 0;
let alertSettings = { level1: 1000, level2: 1500, notifications: true };
let lastAlertLevel = 0;

// --- MQTT Connection ---
const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://localhost:1883";
const MQTT_USER = process.env.MQTT_USER || "b1362cdd5724c3f1b42f34fb10d921ee";
const MQTT_PASS = process.env.MQTT_PASS || "youmeng2022";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "/iot/2139/stm32";
const MQTT_CONTROL_TOPIC = process.env.MQTT_CONTROL_TOPIC || "/iot/2139/wx";

const mqttClient = mqtt.connect(MQTT_BROKER, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: `cloude_api_${Date.now()}`,
  reconnectPeriod: 5000,
});

const wsClients = new Set();

mqttClient.on("connect", () => {
  console.log("MQTT connected to", MQTT_BROKER);
  mqttClient.subscribe(MQTT_TOPIC);
});


mqttClient.on("message", async (_topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    latestData = { ...data, ts: new Date().toISOString() };
    lastHeartbeat = Date.now();

    await pool.query(
      "INSERT INTO readings (co2, temperature, humidity, alarm, slope, eta, trend, device) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [data.co2, data.temp, data.hum, data.alarm, data.slope || 0, data.eta || -1, data.trend || 0, data.dev || "co2_001"]
    );

    // Alert logic
    let currentLevel = 0;
    if (data.co2 >= alertSettings.level2) currentLevel = 2;
    else if (data.co2 >= alertSettings.level1) currentLevel = 1;

    if (currentLevel > lastAlertLevel) {
      const msg = currentLevel === 2
        ? `CO2 达到 ${data.co2} ppm，超标报警！`
        : `CO2 上升到 ${data.co2} ppm，建议通风。`;
      await pool.query(
        "INSERT INTO alerts (level, co2, message) VALUES ($1,$2,$3)",
        [currentLevel, data.co2, msg]
      );
    }
    lastAlertLevel = currentLevel;

    // Broadcast to WebSocket clients
    const wsMsg = JSON.stringify({ type: "realtime", data: latestData });
    for (const ws of wsClients) {
      if (ws.readyState === 1) ws.send(wsMsg);
    }
  } catch (e) { /* ignore malformed */ }
});

mqttClient.on("error", (err) => console.error("MQTT error:", err.message));

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
      windDir: today ? today.fx : "",
      windScale: today ? today.fl : "",
      feelsLike: parseFloat(d.wendu),
      pm25: d.pm25,
      quality: d.quality,
    };
  } catch (e) { /* timeout or network error */ }
  return null;
}


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

// --- REST Endpoints ---
app.get("/api/v1/health", (_req, res) => {
  res.json({ ok: true, mqtt: mqttClient.connected, lastHeartbeat });
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
  if (!latestData) {
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
  const online = Date.now() - lastHeartbeat < 15000;
  res.json({ data: latestData, online });
});

app.get("/api/v1/weather/compare", async (_req, res) => {
  const indoor = latestData || {};
  const outdoor = await fetchOutdoorWeather();
  const online = Date.now() - lastHeartbeat < 15000;
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

// --- Holt-Winters double exponential smoothing ---
function holtWinters(data, alpha = 0.3, beta = 0.1, horizon = 30) {
  if (data.length < 2) return [];
  let level = data[0];
  let trend = data[1] - data[0];

  for (let i = 1; i < data.length; i++) {
    const prevLevel = level;
    level = alpha * data[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  const predictions = [];
  for (let i = 1; i <= horizon; i++) {
    predictions.push(Math.round(level + trend * i));
  }
  return predictions;
}

function predictionErrorMetrics(minuteData) {
  if (minuteData.length < 4) {
    return { mae: null, rmse: null, samples: 0, basis: "rolling_1min_backtest" };
  }
  const errors = [];
  for (let i = 3; i < minuteData.length; i++) {
    const train = minuteData.slice(0, i);
    const forecast = holtWinters(train, 0.4, 0.15, 1)[0];
    if (Number.isFinite(forecast)) {
      errors.push(forecast - minuteData[i]);
    }
  }
  if (errors.length === 0) {
    return { mae: null, rmse: null, samples: 0, basis: "rolling_1min_backtest" };
  }
  const mae = errors.reduce((sum, error) => sum + Math.abs(error), 0) / errors.length;
  const rmse = Math.sqrt(errors.reduce((sum, error) => sum + error ** 2, 0) / errors.length);
  return {
    mae: Math.round(mae * 10) / 10,
    rmse: Math.round(rmse * 10) / 10,
    samples: errors.length,
    basis: "rolling_1min_backtest"
  };
}

function aggregateBySampleWindow(data, windowSize) {
  const buckets = [];
  for (let i = 0; i < data.length; i += windowSize) {
    const slice = data.slice(i, i + windowSize);
    if (slice.length > 0) {
      buckets.push(slice.reduce((sum, value) => sum + value, 0) / slice.length);
    }
  }
  return buckets;
}

// --- Adaptive regression: picks best model (linear vs quadratic) on short window ---
function adaptiveRegression(data) {
  const n = data.length;
  if (n < 3) return { slope: 0, accel: 0, r2: 0, model: "none" };

  // Linear regression
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += data[i]; sxy += i * data[i]; sx2 += i * i;
  }
  const linDenom = n * sx2 - sx * sx;
  let linB = 0, linA = 0;
  if (Math.abs(linDenom) > 1e-6) {
    linB = (n * sxy - sx * sy) / linDenom;
    linA = (sy - linB * sx) / n;
  }
  let linSsRes = 0, ssTot = 0;
  const mean = sy / n;
  for (let i = 0; i < n; i++) {
    linSsRes += (data[i] - (linA + linB * i)) ** 2;
    ssTot += (data[i] - mean) ** 2;
  }
  const linR2 = ssTot > 0 ? Math.max(0, 1 - linSsRes / ssTot) : 1;

  // Quadratic regression
  let qsx = 0, qsx2 = 0, qsx3 = 0, qsx4 = 0;
  let qsy = 0, qsxy = 0, qsx2y = 0;
  for (let i = 0; i < n; i++) {
    qsx += i; qsx2 += i*i; qsx3 += i*i*i; qsx4 += i*i*i*i;
    qsy += data[i]; qsxy += i*data[i]; qsx2y += i*i*data[i];
  }
  const qd = n*(qsx2*qsx4-qsx3*qsx3) - qsx*(qsx*qsx4-qsx3*qsx2) + qsx2*(qsx*qsx3-qsx2*qsx2);
  let qa = 0, qb = 0, qc = 0;
  if (Math.abs(qd) > 1e-6) {
    qc = (qsy*(qsx2*qsx4-qsx3*qsx3)-qsx*(qsxy*qsx4-qsx2y*qsx3)+qsx2*(qsxy*qsx3-qsx2y*qsx2))/qd;
    qb = (n*(qsxy*qsx4-qsx2y*qsx3)-qsy*(qsx*qsx4-qsx3*qsx2)+qsx2*(qsx*qsx2y-qsxy*qsx2))/qd;
    qa = (n*(qsx2*qsx2y-qsx3*qsxy)-qsx*(qsx*qsx2y-qsxy*qsx2)+qsy*(qsx*qsx3-qsx2*qsx2))/qd;
  }
  let quadSsRes = 0;
  for (let i = 0; i < n; i++) {
    quadSsRes += (data[i] - (qa*i*i + qb*i + qc)) ** 2;
  }
  const quadR2 = ssTot > 0 ? Math.max(0, 1 - quadSsRes / ssTot) : 1;

  if (quadR2 > linR2 && quadR2 > 0.7) {
    const deriv1 = 2 * qa * (n - 1) + qb;
    const deriv2 = 2 * qa;
    return { slope: deriv1, accel: deriv2, r2: quadR2, model: "quadratic", a: qa, b: qb, c: qc };
  }
  return { slope: linB, accel: 0, r2: linR2, model: "linear", a: 0, b: linB, c: linA };
}

// --- Pearson correlation ---
function pearsonCorr(x, y) {
  const n = x.length;
  if (n < 3) return 0;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += x[i]; my += y[i]; }
  mx /= n; my /= n;
  let sxy = 0, sx2 = 0, sy2 = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sx2 += (x[i] - mx) ** 2;
    sy2 += (y[i] - my) ** 2;
  }
  if (sx2 < 1 || sy2 < 1) return 0;
  return sxy / Math.sqrt(sx2 * sy2);
}

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
        current: latestData?.co2 ?? null,
        filtered: latestData?.co2 ?? null,
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
  const online = Date.now() - lastHeartbeat < 15000;
  res.json({ items: [
    { id: "co2-sensor-01", name: "CO2 检测终端", type: "SCD41 + STM32", isOnline: online,
      currentValue: latestData?.co2 || 0, unit: "ppm", lastSeen: latestData?.ts },
  ]});
});

app.get("/api/v1/alerts", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM alerts ORDER BY id DESC LIMIT 50");
  res.json({ items: rows });
});

app.get("/api/v1/analytics/co2-alert-settings", (_req, res) => res.json(alertSettings));

app.put("/api/v1/analytics/co2-alert-settings", (req, res) => {
  const parsed = alertSettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  alertSettings = parsed.data;
  res.json(alertSettings);
});

// --- AI Public API (API Key auth) ---
const API_KEY = process.env.API_KEY || "co2-demo-key-2026";

function requireApiKey(req, res, next) {
  const key = req.headers["x-api-key"] || req.query.apikey;
  if (key !== API_KEY) return res.status(401).json({ error: "Invalid API key" });
  next();
}

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
  res.json({ data: latestData, online: Date.now() - lastHeartbeat < 15000 });
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
    device: "co2_001", online: Date.now() - lastHeartbeat < 15000,
    lastData: latestData, alertSettings,
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
      "/api/v1/realtime/co2": { get: { summary: "Get latest CO2 reading", responses: { 200: { description: "Current data" } } } },
      "/api/v1/history/co2": { get: { summary: "Get historical readings", parameters: [{ name: "range", in: "query", schema: { type: "string", enum: ["1h","6h","24h","7d"] } }], responses: { 200: { description: "Historical points" } } } },
      "/api/v1/devices": { get: { summary: "List devices", responses: { 200: { description: "Device list" } } } },
      "/api/v1/alerts": { get: { summary: "Get recent alerts", responses: { 200: { description: "Alert list" } } } },
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
  if (latestData) ws.send(JSON.stringify({ type: "realtime", data: latestData }));
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
