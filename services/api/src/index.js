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

app.get("/api/v1/realtime/co2", (_req, res) => {
  if (!latestData) return res.json({ data: null, online: false });
  const online = Date.now() - lastHeartbeat < 15000;
  res.json({ data: latestData, online });
});


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
