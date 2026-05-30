import cors from "cors";
import express from "express";
import { z } from "zod";
import mqtt from "mqtt";
import Database from "better-sqlite3";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3100;

app.use(cors());
app.use(express.json());

// --- Database Setup ---
const db = new Database(join(__dirname, "../co2_data.db"));
db.pragma("journal_mode = WAL");

// Migrate: add prediction columns if missing
try {
  db.exec("ALTER TABLE readings ADD COLUMN slope INTEGER DEFAULT 0");
  db.exec("ALTER TABLE readings ADD COLUMN eta INTEGER DEFAULT -1");
  db.exec("ALTER TABLE readings ADD COLUMN trend INTEGER DEFAULT 0");
} catch (_) { /* columns already exist */ }

db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    co2 INTEGER NOT NULL,
    temperature REAL NOT NULL,
    humidity REAL NOT NULL,
    alarm INTEGER NOT NULL DEFAULT 0,
    slope INTEGER DEFAULT 0,
    eta INTEGER DEFAULT -1,
    trend INTEGER DEFAULT 0,
    device TEXT NOT NULL DEFAULT 'co2_001'
  );
  CREATE INDEX IF NOT EXISTS idx_readings_ts ON readings(ts);
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    level INTEGER NOT NULL,
    co2 INTEGER NOT NULL,
    message TEXT NOT NULL
  );
`);

const insertReading = db.prepare(
  "INSERT INTO readings (co2, temperature, humidity, alarm, slope, eta, trend, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);
const insertAlert = db.prepare(
  "INSERT INTO alerts (level, co2, message) VALUES (?, ?, ?)"
);

// --- State ---
let latestData = null;
let lastHeartbeat = 0;
let alertSettings = { level1: 1000, level2: 1500, notifications: true };
let lastAlertLevel = 0;

// --- MQTT Connection ---
const MQTT_BROKER = "mqtt://t.yoyolife.fun:1883";
const MQTT_USER = "b1362cdd5724c3f1b42f34fb10d921ee";
const MQTT_PASS = "youmeng2022";
const MQTT_TOPIC = "/iot/2139/stm32";

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

mqttClient.on("message", (_topic, payload) => {
  try {
    const data = JSON.parse(payload.toString());
    latestData = { ...data, ts: new Date().toISOString() };
    lastHeartbeat = Date.now();

    insertReading.run(data.co2, data.temp, data.hum, data.alarm, data.slope || 0, data.eta || -1, data.trend || 0, data.dev || "co2_001");

    // Alert logic
    let currentLevel = 0;
    if (data.co2 >= alertSettings.level2) currentLevel = 2;
    else if (data.co2 >= alertSettings.level1) currentLevel = 1;

    if (currentLevel > lastAlertLevel) {
      const msg = currentLevel === 2
        ? `CO2 达到 ${data.co2} ppm，超标报警！`
        : `CO2 上升到 ${data.co2} ppm，建议通风。`;
      insertAlert.run(currentLevel, data.co2, msg);
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

app.get("/api/v1/history/co2", (req, res) => {
  const range = req.query.range || "1h";
  const rangeMap = { "1h": 720, "6h": 4320, "24h": 17280, "7d": 120960 };
  const limit = rangeMap[range] || 720;
  const rows = db.prepare(
    "SELECT ts, co2, temperature, humidity, alarm, slope, eta, trend FROM readings ORDER BY id DESC LIMIT ?"
  ).all(limit).reverse();
  res.json({ range, count: rows.length, points: rows });
});

app.get("/api/v1/devices", (_req, res) => {
  const online = Date.now() - lastHeartbeat < 15000;
  res.json({ items: [
    { id: "co2-sensor-01", name: "CO2 检测终端", type: "SCD41 + STM32", isOnline: online,
      currentValue: latestData?.co2 || 0, unit: "ppm", lastSeen: latestData?.ts },
  ]});
});

app.get("/api/v1/alerts", (_req, res) => {
  const rows = db.prepare("SELECT * FROM alerts ORDER BY id DESC LIMIT 50").all();
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

app.get("/api/v1/public/co2/current", requireApiKey, (_req, res) => {
  res.json({ data: latestData, online: Date.now() - lastHeartbeat < 15000 });
});

app.get("/api/v1/public/co2/history", requireApiKey, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const rows = db.prepare(
    "SELECT ts, co2, temperature, humidity FROM readings ORDER BY id DESC LIMIT ?"
  ).all(limit).reverse();
  res.json({ count: rows.length, points: rows });
});

app.get("/api/v1/public/device/status", requireApiKey, (_req, res) => {
  res.json({
    device: "co2_001", online: Date.now() - lastHeartbeat < 15000,
    lastData: latestData, alertSettings,
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

server.listen(port, () => {
  console.log(`Cloude API listening on port ${port}`);
  console.log(`WebSocket at ws://localhost:${port}/ws/realtime`);
});

