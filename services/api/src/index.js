import cors from "cors";
import express from "express";
import { z } from "zod";

const app = express();
const port = process.env.PORT || 3100;

app.use(cors());
app.use(express.json());

const user = {
  id: "demo-user",
  name: "Liu Gaopeng",
  email: "demo@cloude.app"
};

const devices = [
  {
    id: "co2-sensor-01",
    name: "CO2 Detector",
    type: "sensor",
    connectivity: "wifi",
    isOn: true,
    isOnline: true,
    currentValue: 940
  },
  {
    id: "vent-01",
    name: "Fresh Air Fan",
    type: "ventilation",
    connectivity: "wifi",
    isOn: false,
    isOnline: true,
    currentValue: 0
  },
  {
    id: "bridge-01",
    name: "BLE Bridge",
    type: "gateway",
    connectivity: "bluetooth",
    isOn: true,
    isOnline: true,
    currentValue: 1
  }
];

const scenes = [
  { id: "home", name: "Home mode", description: "Normal comfort workflow." },
  { id: "away", name: "Away mode", description: "Low activity safety workflow." },
  { id: "vent", name: "Ventilation mode", description: "Fresh air boost." }
];

let alertSettings = {
  level1: 1000,
  level2: 1500,
  notifications: true
};

const trendPayload = {
  current: 940,
  mean: 861,
  peak: 980,
  forecast30m: 1015,
  forecast2h: 1120,
  points: [720, 760, 810, 845, 910, 940, 980, 930],
  labels: ["6h", "9h", "12h", "15h", "18h", "21h", "24h", "Now"]
};

const alertHistory = [
  {
    id: "event-1",
    createdAt: "2026-04-15T09:20:00+08:00",
    message: "CO2 exceeded level-1 threshold at 1030 ppm."
  },
  {
    id: "event-2",
    createdAt: "2026-04-15T09:42:00+08:00",
    message: "Ventilation mode executed automatically."
  },
  {
    id: "event-3",
    createdAt: "2026-04-15T10:05:00+08:00",
    message: "CO2 returned to safe band under 900 ppm."
  }
];

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

const patchDeviceSchema = z.object({
  isOn: z.boolean().optional()
});

const alertSettingsSchema = z.object({
  level1: z.number().int().min(400).max(5000),
  level2: z.number().int().min(400).max(5000),
  notifications: z.boolean()
});

app.get("/api/v1/health", (_req, res) => {
  res.json({
    ok: true,
    service: "cloude-api",
    thesisRole: "interaction and analytics support"
  });
});

app.post("/api/v1/auth/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  return res.json({
    token: "demo-token",
    user
  });
});

app.get("/api/v1/auth/me", (_req, res) => {
  res.json(user);
});

app.get("/api/v1/devices", (_req, res) => {
  res.json({ items: devices });
});

app.patch("/api/v1/devices/:id", (req, res) => {
  const parsed = patchDeviceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const device = devices.find((item) => item.id === req.params.id);
  if (!device) {
    return res.status(404).json({ error: "Device not found" });
  }

  Object.assign(device, parsed.data);
  return res.json(device);
});

app.get("/api/v1/scenes", (_req, res) => {
  res.json({ items: scenes });
});

app.post("/api/v1/scenes/:id/execute", (req, res) => {
  const scene = scenes.find((item) => item.id === req.params.id);
  if (!scene) {
    return res.status(404).json({ error: "Scene not found" });
  }

  return res.json({
    ok: true,
    scene,
    executedAt: new Date().toISOString()
  });
});

app.get("/api/v1/weather", (_req, res) => {
  res.json({
    location: "Tianjin",
    temperature: 26,
    humidity: 71,
    summary: "Indoor calm airflow"
  });
});

app.get("/api/v1/analytics/co2-trend", (_req, res) => {
  res.json(trendPayload);
});

app.get("/api/v1/analytics/co2-alert-settings", (_req, res) => {
  res.json(alertSettings);
});

app.put("/api/v1/analytics/co2-alert-settings", (req, res) => {
  const parsed = alertSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  alertSettings = parsed.data;
  return res.json(alertSettings);
});

app.get("/api/v1/analytics/co2-alert-history", (_req, res) => {
  res.json({ items: alertHistory });
});

app.listen(port, () => {
  console.log(`Cloude API listening on port ${port}`);
});
