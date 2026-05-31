const API_BASE_URL =
  process.env.EXPO_PUBLIC_CO2_API_BASE_URL ?? "http://co2.tengokukk.com:3100";
const API_KEY = process.env.EXPO_PUBLIC_CO2_API_KEY ?? "co2-demo-key-2026";
const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws");
const WS_URL = `${WS_BASE_URL}/ws/realtime`;

export async function fetchApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (API_KEY) {
    headers.set("X-API-Key", API_KEY);
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    throw new Error(`API ${path} responded ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export type Co2Level = "normal" | "warning" | "danger";

export function resolveCo2Level(co2: number): Co2Level {
  if (co2 >= 1500) return "danger";
  if (co2 >= 1000) return "warning";
  return "normal";
}

export function getCo2LevelColor(level: Co2Level): string {
  switch (level) {
    case "danger": return "#b3261e";
    case "warning": return "#b26a00";
    default: return "#1f6f5f";
  }
}

export function getCo2LevelLabel(level: Co2Level): string {
  switch (level) {
    case "danger": return "危险";
    case "warning": return "预警";
    default: return "正常";
  }
}

export function connectRealtime(
  onData: (data: any) => void
): () => void {
  let ws: WebSocket | null = null;
  let closed = false;

  function connect() {
    if (closed) return;
    ws = new WebSocket(WS_URL);
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        if (parsed.type === "realtime" && parsed.data) {
          onData(parsed.data);
        } else {
          onData(parsed);
        }
      } catch {}
    };
    ws.onclose = () => {
      if (!closed) setTimeout(connect, 3000);
    };
    ws.onerror = () => ws?.close();
  }

  connect();
  return () => { closed = true; ws?.close(); };
}
