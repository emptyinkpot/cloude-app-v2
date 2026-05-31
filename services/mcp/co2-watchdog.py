"""CO2 Watchdog - polls CO2 API and pushes alerts to AstrBot.

Environment variables:
  CO2_API_BASE       - default http://127.0.0.1:3100
  ASTRBOT_API_BASE   - default http://127.0.0.1:6185
  ASTRBOT_API_KEY    - required, AstrBot Open API key
  CO2_NOTIFY_SESSION - required, target session ID for push messages
  CO2_POLL_INTERVAL  - default 60 (seconds)
  CO2_WARN_THRESHOLD - default 1000 (ppm)
  CO2_DANGER_THRESHOLD - default 1500 (ppm)
"""

import json
import os
import time
import urllib.request

CO2_API = os.environ.get("CO2_API_BASE", "http://127.0.0.1:3100")
ASTRBOT_API = os.environ.get("ASTRBOT_API_BASE", "http://127.0.0.1:6185")
ASTRBOT_KEY = os.environ.get("ASTRBOT_API_KEY", "")
NOTIFY_SESSION = os.environ.get("CO2_NOTIFY_SESSION", "")
POLL_INTERVAL = int(os.environ.get("CO2_POLL_INTERVAL", "60"))
WARN_THRESHOLD = int(os.environ.get("CO2_WARN_THRESHOLD", "1000"))
DANGER_THRESHOLD = int(os.environ.get("CO2_DANGER_THRESHOLD", "1500"))

FAIL_COUNT_LIMIT = 3


def fetch_co2():
    req = urllib.request.Request(f"{CO2_API}/api/v1/realtime/co2")
    resp = urllib.request.urlopen(req, timeout=10)
    return json.loads(resp.read())


def push_message(text: str):
    if not ASTRBOT_KEY or not NOTIFY_SESSION:
        print(f"[watchdog] SKIP push (no key/session): {text}")
        return
    payload = json.dumps({
        "session_id": NOTIFY_SESSION,
        "message": {"type": "text", "text": text},
    }).encode()
    req = urllib.request.Request(
        f"{ASTRBOT_API}/api/v1/im/message",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "X-API-Key": ASTRBOT_KEY,
        },
        method="POST",
    )
    try:
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"[watchdog] push failed: {e}")


def run():
    last_state = "normal"
    fail_count = 0

    print(f"[watchdog] started, polling every {POLL_INTERVAL}s")
    print(f"[watchdog] thresholds: warn={WARN_THRESHOLD}, danger={DANGER_THRESHOLD}")

    while True:
        try:
            res = fetch_co2()
            fail_count = 0
        except Exception as e:
            fail_count += 1
            print(f"[watchdog] fetch failed ({fail_count}): {e}")
            if fail_count >= FAIL_COUNT_LIMIT and last_state != "offline":
                push_message(
                    f"[CO2 告警] 设备离线：连续 {fail_count} 次无法连接 CO2 API"
                )
                last_state = "offline"
            time.sleep(POLL_INTERVAL)
            continue

        data = res.get("data", {})
        co2 = data.get("co2", 0)
        online = res.get("online", False)

        if not online and last_state != "offline":
            push_message(
                f"[CO2 告警] 设备离线（API 可达但设备未上报）\n"
                f"最后数据: {co2} ppm"
            )
            last_state = "offline"
        elif co2 >= DANGER_THRESHOLD and last_state != "danger":
            push_message(
                f"[CO2 危险] 当前浓度 {co2} ppm，超过危险阈值 "
                f"{DANGER_THRESHOLD} ppm\n"
                f"温度: {data.get('temp', '--')} °C | "
                f"湿度: {data.get('hum', '--')}% RH"
            )
            last_state = "danger"
        elif co2 >= WARN_THRESHOLD and last_state not in ("warn", "danger"):
            push_message(
                f"[CO2 预警] 当前浓度 {co2} ppm，超过预警阈值 "
                f"{WARN_THRESHOLD} ppm\n"
                f"温度: {data.get('temp', '--')} °C | "
                f"湿度: {data.get('hum', '--')}% RH"
            )
            last_state = "warn"
        elif co2 < WARN_THRESHOLD and last_state != "normal":
            push_message(
                f"[CO2 恢复] 当前浓度 {co2} ppm，已恢复正常\n"
                f"温度: {data.get('temp', '--')} °C | "
                f"湿度: {data.get('hum', '--')}% RH"
            )
            last_state = "normal"
        else:
            print(f"[watchdog] ok: {co2} ppm, state={last_state}")

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    run()
