# Cloude App

Cloude App 是毕业设计「基于嵌入式的二氧化碳检测与预警器设计」的上位机与服务端工程。仓库覆盖移动端 App、Web 实时大屏、CO2 数据 API、MQTT 接入、PostgreSQL 存储、Docker 部署、AstrBot MCP 查询工具和告警推送脚本。

系统目标是把 STM32 + SCD41 + ESP8266 终端上报的 CO2、温度、湿度与报警状态接入云端，提供实时监测、历史趋势、阈值告警、预测分析、设备控制和外部系统通讯能力。

## 当前功能

### 移动端 App

移动端位于 `apps/mobile`，基于 Expo Router / React Native。当前入口 `app/index.tsx` 是 5 个主页面的 Tab 应用：

- 监测：显示实时 CO2、温度、湿度、设备在线状态、变化率、ETA、多变量融合预测、预测误差和实时折线图。
- 分析：显示 24 小时历史统计、均值、峰值、告警阈值策略和最近告警记录。
- 设备：显示 CO2 检测终端在线状态、当前读数、设备类型和最后上报时间。
- 控制：提供通风模式、静音模式、复位模式，调用 `/api/v1/control` 下发 MQTT 控制指令。
- 系统：显示演示账号、API 健康状态、MQTT 状态、设备心跳、硬件信息和算法信息。

移动端默认连接：

- API: `http://co2.tengokukk.com:3100`
- WebSocket: `ws://co2.tengokukk.com:3100/ws/realtime`
- API Key: `co2-demo-key-2026`

可通过环境变量覆盖：

- `EXPO_PUBLIC_CO2_API_BASE_URL`
- `EXPO_PUBLIC_CO2_API_KEY`

### Web 实时大屏

Web 页面位于 `web/index.html`，由 Nginx 静态托管。它是单屏监测大屏，不是移动端 5 Tab 的同构页面。

当前 Web 功能：

- 实时 CO2 数值、状态颜色和在线状态。
- 温度、湿度、趋势、置信度、误差、变化率概览。
- Chart.js 绘制 1 小时历史曲线。
- Holt-Winters 预测曲线叠加显示。
- MQTT、心跳和报警状态显示。
- WebSocket 自动重连，周期性刷新历史、健康状态和预测结果。

Web 端通过 Nginx 反向代理访问：

- `/api/*` -> `co2-api:3100`
- `/ws/*` -> `co2-api:3100`

### API 服务

API 位于 `services/api`，基于 Express、MQTT、PostgreSQL、WebSocket 和 Zod。

核心能力：

- 订阅 MQTT 主题 `/iot/2139/stm32`，接收 STM32 终端数据。
- 将 CO2、温度、湿度、报警级别、变化率、ETA、趋势和设备 ID 写入 PostgreSQL。
- 根据阈值生成告警记录。
- 通过 WebSocket `/ws/realtime` 广播实时数据。
- 提供 REST API 给移动端、Web 端和外部系统调用。
- 通过 `/api/v1/control` 将控制命令发布到 MQTT 控制主题 `/iot/2139/wx`。
- 提供 API Key 保护的公开接口，便于后续外部通讯和系统集成。

主要接口：

| Method | Path | 功能 |
| --- | --- | --- |
| `GET` | `/api/v1/health` | 服务、MQTT 和设备心跳健康检查 |
| `POST` | `/api/v1/auth/login` | 演示账号登录 |
| `GET` | `/api/v1/auth/me` | 当前演示用户信息 |
| `GET` | `/api/v1/realtime/co2` | 最新 CO2 实时数据 |
| `GET` | `/api/v1/history/co2?range=1h|6h|24h|7d` | 历史 CO2 数据 |
| `GET` | `/api/v1/predict/co2` | 多变量融合预测结果 |
| `GET` | `/api/v1/devices` | 设备列表和在线状态 |
| `GET` | `/api/v1/alerts` | 最近告警记录 |
| `GET` | `/api/v1/analytics/co2-alert-settings` | 当前告警阈值 |
| `PUT` | `/api/v1/analytics/co2-alert-settings` | 更新告警阈值 |
| `POST` | `/api/v1/control` | API Key 鉴权后下发 MQTT 控制命令 |
| `GET` | `/api/v1/public/co2/current` | API Key 鉴权的当前数据 |
| `GET` | `/api/v1/public/co2/history` | API Key 鉴权的历史数据 |
| `GET` | `/api/v1/public/device/status` | API Key 鉴权的设备状态 |
| `GET` | `/api/docs` | OpenAPI 风格接口描述 |

### 预测与误差评估

`/api/v1/predict/co2` 当前返回：

- 当前 CO2、EWMA 滤波值、变化率、加速度。
- 自适应回归模型选择：线性或二次模型。
- CO2 与温度、湿度的 Pearson 相关系数。
- 环境因子评分。
- 置信度。
- Holt-Winters 未来 30 分钟预测点。
- ETA 预警和 ETA 报警。
- 基于 1 分钟窗口滚动回测的 MAE、RMSE 和样本数。

算法字段为：

```text
adaptive_regression + multi_variable_fusion + holt_winters
```

### Docker 部署

根目录 `docker-compose.yml` 启动完整服务端链路：

- `mosquitto`: MQTT Broker。
- `postgres`: CO2 历史数据和告警数据存储。
- `co2-api`: Express API，监听 `3100`。
- `nginx`: Web 静态页和 `/api`、`/ws` 反向代理，监听 `80`。

移动端 App 不运行在 Docker 中。它是 Expo / React Native 应用，通过 HTTP 和 WebSocket 连接 API 服务。

### AstrBot / MCP 接入

MCP 服务位于 `services/mcp/co2-mcp.py`，用于 AstrBot 通过工具调用读取 CO2 系统状态。

工具列表：

- `co2_realtime`: 查询当前 CO2、温湿度、设备在线状态和 MQTT 状态。
- `co2_predict`: 查询趋势预测、置信度、模型、误差、ETA 和预测点。
- `co2_history`: 查询最近 1 小时最高、最低、均值、最新值和时间范围。

运行语义：

- MCP 使用 stdio transport。
- AstrBot 容器内通过 `http://127.0.0.1:3100` 访问 CO2 API。
- 当前生产路径为 `/srv/astrbot/data/mcp-servers/co2-mcp.py`。

告警推送脚本位于 `services/mcp/co2-watchdog.py`，用于周期性轮询 API，并通过 AstrBot Open API 推送离线、预警、危险和恢复通知。

## 仓库结构

```text
apps/mobile/        Expo Router / React Native 移动端
services/api/       Express + MQTT + PostgreSQL + WebSocket API
services/mcp/       AstrBot MCP 工具和 CO2 watchdog
services/mosquitto/ Mosquitto 配置
web/                Web 实时大屏
nginx/              Nginx 反向代理配置
docker-compose.yml  服务端 Docker 编排
```

## 快速启动

安装依赖：

```bash
npm install
```

启动 API 开发服务：

```bash
npm run dev:api
```

启动移动端：

```bash
npm run dev:mobile
```

启动 Docker 服务端链路：

```bash
docker compose up -d --build
```

检查 API：

```bash
curl http://localhost:3100/api/v1/health
```

## 环境变量

根目录 `.env.example` 包含服务端默认配置：

```text
DB_PASSWORD=co2secret2026
MQTT_USER=b1362cdd5724c3f1b42f34fb10d921ee
MQTT_PASS=youmeng2022
API_KEY=co2-demo-key-2026
```

API 服务还支持：

- `PORT`
- `MQTT_BROKER`
- `MQTT_TOPIC`
- `MQTT_CONTROL_TOPIC`
- `DATABASE_URL`

移动端支持：

- `EXPO_PUBLIC_CO2_API_BASE_URL`
- `EXPO_PUBLIC_CO2_API_KEY`

watchdog 支持：

- `CO2_API_BASE`
- `ASTRBOT_API_BASE`
- `ASTRBOT_API_KEY`
- `CO2_NOTIFY_SESSION`
- `CO2_POLL_INTERVAL`
- `CO2_WARN_THRESHOLD`
- `CO2_DANGER_THRESHOLD`

## 外部通讯能力

项目已经具备对外通讯基础：

- 设备到云端：STM32/ESP8266 通过 MQTT 上报到 Broker。
- 云端到设备：API 通过 `/api/v1/control` 发布 MQTT 控制命令。
- Web / App 到云端：HTTP REST + WebSocket。
- 第三方系统到云端：API Key 保护的 `/api/v1/public/*` 接口。
- AstrBot 到云端：MCP 工具调用。
- 云端到 AstrBot：watchdog 通过 AstrBot Open API 推送告警。

## 常用命令

```bash
npm run dev:api
npm run dev:mobile
npm run lint
docker compose up -d --build
docker compose logs -f co2-api
```

## 论文功能映射

- 登录 / 访问边界：`apps/mobile/app/login.tsx` 保留演示登录页，当前主入口直接进入 5 Tab 演示页面。
- 实时监测：移动端监测页、Web 大屏、`/api/v1/realtime/co2`、`/ws/realtime`。
- 趋势分析：移动端分析页、Web 曲线、`/api/v1/history/co2`。
- 预测预警：`/api/v1/predict/co2`、移动端预测卡片、Web 预测曲线、MCP `co2_predict`。
- 设备管理：移动端设备页、`/api/v1/devices`。
- 场景控制：移动端控制页、`/api/v1/control`、MQTT 控制主题。
- 系统维护：移动端系统页、`/api/v1/health`。
- 智能体接入：AstrBot MCP 工具和 watchdog 告警推送。

## 当前边界

- 移动端和 Web 端不是同一套界面：移动端是多页面 App，Web 是单屏监控大屏。
- 移动端 App 不使用 Docker；服务端、数据库、MQTT Broker、Nginx 使用 Docker。
- 登录为毕业设计演示边界，不是完整生产账号体系。
- 预测算法用于趋势演示和工程说明，精度依赖采样稳定性、传感器数据质量和历史窗口长度。
