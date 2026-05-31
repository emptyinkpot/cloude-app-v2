"""CO2 Monitor MCP - runs INSIDE AstrBot Docker container (stdio transport).
Calls co2-api on 127.0.0.1:3100 (container uses --network host).
"""

import asyncio
import json
import urllib.request

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

app = Server("co2-mcp")

API_BASE = "http://127.0.0.1:3100"


def _fetch(path):
    req = urllib.request.Request(f"{API_BASE}{path}")
    resp = urllib.request.urlopen(req, timeout=10)
    return json.loads(resp.read())


@app.list_tools()
async def list_tools():
    return [
        Tool(
            name="co2_realtime",
            description="查询当前 CO2 浓度、温湿度、设备在线状态",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="co2_predict",
            description="查询 CO2 趋势预测、置信度、模型信息",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="co2_history",
            description="查询最近1小时 CO2 历史摘要（最高/最低/均值）",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
        Tool(
            name="co2_weather",
            description="对比室内外环境：室内CO2/温湿度 vs 当地天气，给出通风建议",
            inputSchema={"type": "object", "properties": {}, "required": []},
        ),
    ]


@app.call_tool()
async def call_tool(name: str, arguments: dict):
    if name == "co2_realtime":
        return _handle_realtime()
    elif name == "co2_predict":
        return _handle_predict()
    elif name == "co2_history":
        return _handle_history()
    elif name == "co2_weather":
        return _handle_weather()
    return [TextContent(type="text", text=f"unknown tool: {name}")]


def _handle_realtime():
    try:
        rt = _fetch("/api/v1/realtime/co2")
        health = _fetch("/api/v1/health")
    except Exception as e:
        return [TextContent(type="text", text=f"查询失败: {e}")]

    d = rt.get("data", {})
    online = rt.get("online", False)
    co2 = d.get("co2", 0)
    level = "危险" if co2 >= 1500 else "预警" if co2 >= 1000 else "正常"

    text = (
        f"## CO2 实时状态\n"
        f"- 浓度: {co2} ppm ({level})\n"
        f"- 温度: {d.get('temp', '--')} °C\n"
        f"- 湿度: {d.get('hum', '--')}% RH\n"
        f"- 变化率: {d.get('slope', 0)} ppm/min\n"
        f"- 设备: {'在线' if online else '离线'}"
        f" ({d.get('dev', '--')})\n"
        f"- MQTT: {'已连接' if health.get('mqtt') else '断开'}\n"
        f"- 时间: {d.get('ts', '--')}"
    )
    return [TextContent(type="text", text=text)]


def _handle_predict():
    try:
        res = _fetch("/api/v1/predict/co2")
    except Exception as e:
        return [TextContent(type="text", text=f"查询失败: {e}")]

    error = res.get("error", {})
    mae = error.get("mae")
    rmse = error.get("rmse")
    error_text = "暂无足够回测样本"
    if mae is not None and rmse is not None:
        error_text = f"平均误差 ±{mae} ppm，RMSE {rmse} ppm"

    text = (
        f"## CO2 趋势预测\n"
        f"- 当前浓度: {res.get('current', '--')} ppm\n"
        f"- 滤波值: {res.get('filtered', '--')} ppm\n"
        f"- 变化率: {res.get('slope', '--')} ppm/min\n"
        f"- 置信度: {res.get('confidence', '--')}%\n"
        f"- 环境因子: {res.get('env_factor', '--')}%\n"
        f"- 趋势: {res.get('trend', '--')}\n"
        f"- 模型: {res.get('model', '--')}\n"
        f"- 预测误差: {error_text}\n"
        f"- 回测样本: {error.get('samples', 0)} 个1分钟点\n"
        f"- 数据窗口: {res.get('data_freshness', '--')} / {res.get('samples', '--')} 条样本\n"
        f"- CO2-温度相关系数: {res.get('correlation', {}).get('co2_temp', '--')}\n"
        f"- CO2-湿度相关系数: {res.get('correlation', {}).get('co2_hum', '--')}\n"
        f"- 算法: {res.get('algorithm', '--')}"
    )
    forecast = res.get("prediction", {}).get("points") or res.get("forecast", [])
    if forecast:
        pts = ", ".join(f"{p.get('t')}: {p.get('co2')} ppm" for p in forecast[:6])
        text += f"\n- 预测点: {pts}"
        eta = res.get("prediction", {})
        if eta.get("eta_warning") is not None or eta.get("eta_alarm") is not None:
            text += (
                f"\n- ETA预警: {eta.get('eta_warning', '--')} 秒"
                f"\n- ETA报警: {eta.get('eta_alarm', '--')} 秒"
            )
    return [TextContent(type="text", text=text)]


def _handle_history():
    try:
        res = _fetch("/api/v1/history/co2?range=1h")
    except Exception as e:
        return [TextContent(type="text", text=f"查询失败: {e}")]

    points = res.get("points", [])
    if not points:
        return [TextContent(type="text", text="最近1小时无历史数据")]

    values = [p.get("co2", 0) for p in points]
    avg = sum(values) / len(values)
    text = (
        f"## CO2 最近1小时历史\n"
        f"- 数据点数: {len(values)}\n"
        f"- 最高: {max(values)} ppm\n"
        f"- 最低: {min(values)} ppm\n"
        f"- 均值: {avg:.0f} ppm\n"
        f"- 最新: {values[-1]} ppm\n"
        f"- 时间范围: {points[0].get('ts', '--')} → {points[-1].get('ts', '--')}"
    )
    return [TextContent(type="text", text=text)]


def _handle_weather():
    try:
        res = _fetch("/api/v1/weather/compare")
    except Exception as e:
        return [TextContent(type="text", text=f"查询失败: {e}")]

    indoor = res.get("indoor", {})
    outdoor = res.get("outdoor", {})
    comp = res.get("comparison")

    text = f"## 室内外环境对比\n"
    text += f"### 室内（传感器）\n"
    text += f"- CO2: {indoor.get('co2', '--')} ppm\n"
    text += f"- 温度: {indoor.get('temp', '--')} °C\n"
    text += f"- 湿度: {indoor.get('hum', '--')}% RH\n"
    text += f"- 设备: {'在线' if indoor.get('online') else '离线'}\n"
    text += f"- BSSID: {indoor.get('bssid', '--')}\n"

    if outdoor.get("error"):
        text += f"\n### 室外天气\n- 未配置天气 API ({outdoor['error']})"
    else:
        text += f"\n### 室外天气（当地实时）\n"
        text += f"- 天气: {outdoor.get('text', '--')}\n"
        text += f"- 温度: {outdoor.get('temp', '--')} °C\n"
        text += f"- 体感: {outdoor.get('feelsLike', '--')} °C\n"
        text += f"- 湿度: {outdoor.get('humidity', '--')}%\n"
        text += f"- 风向: {outdoor.get('windDir', '--')} {outdoor.get('windScale', '--')}级\n"

    if comp:
        text += f"\n### 对比分析\n"
        text += f"- 温差: {comp.get('temp_diff', '--')} °C（室内-室外）\n"
        text += f"- 湿度差: {comp.get('hum_diff', '--')}%（室内-室外）\n"
        text += f"- 建议: {comp.get('ventilation_advice', '--')}"

    return [TextContent(type="text", text=text)]


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await app.run(read_stream, write_stream, app.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
