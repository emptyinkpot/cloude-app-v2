import mqtt from "mqtt";
import { pool } from "./db.js";
import { state, wsClients } from "./state.js";

const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://localhost:1883";
const MQTT_USER = process.env.MQTT_USER || "b1362cdd5724c3f1b42f34fb10d921ee";
const MQTT_PASS = process.env.MQTT_PASS || "youmeng2022";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "/iot/2139/stm32";
export const MQTT_CONTROL_TOPIC = process.env.MQTT_CONTROL_TOPIC || "/iot/2139/wx";

export const mqttClient = mqtt.connect(MQTT_BROKER, {
  username: MQTT_USER,
  password: MQTT_PASS,
  clientId: `cloude_api_${Date.now()}`,
  reconnectPeriod: 5000,
});

mqttClient.on("connect", () => {
  console.log("MQTT connected to", MQTT_BROKER);
  mqttClient.subscribe(MQTT_TOPIC);
});

mqttClient.on("message", async (_topic, payload) => {
  let data;
  try {
    data = JSON.parse(payload.toString());
  } catch {
    return; // malformed payload, skip silently
  }
  try {
    state.latestData = { ...data, ts: new Date().toISOString() };
    state.lastHeartbeat = Date.now();

    await pool.query(
      "INSERT INTO readings (co2, temperature, humidity, alarm, slope, eta, trend, device) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [data.co2, data.temp, data.hum, data.alarm, data.slope || 0, data.eta || -1, data.trend || 0, data.dev || "co2_001"]
    );

    // Alert logic
    let currentLevel = 0;
    if (data.co2 >= state.alertSettings.level2) currentLevel = 2;
    else if (data.co2 >= state.alertSettings.level1) currentLevel = 1;

    if (currentLevel > state.lastAlertLevel) {
      const msg = currentLevel === 2
        ? `CO2 达到 ${data.co2} ppm，超标报警！`
        : `CO2 上升到 ${data.co2} ppm，建议通风。`;
      await pool.query(
        "INSERT INTO alerts (level, co2, message) VALUES ($1,$2,$3)",
        [currentLevel, data.co2, msg]
      );
    }
    state.lastAlertLevel = currentLevel;

    // Broadcast to WebSocket clients
    const wsMsg = JSON.stringify({ type: "realtime", data: state.latestData });
    for (const ws of wsClients) {
      if (ws.readyState === 1) ws.send(wsMsg);
    }
  } catch (e) {
    console.error("MQTT message handling failed:", e.message);
  }
});

mqttClient.on("error", (err) => console.error("MQTT error:", err.message));
