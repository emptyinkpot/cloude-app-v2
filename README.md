# Cloude App

Cloude App is the companion mobile and service application for the thesis
"基于嵌入式的二氧化碳检测与预警器设计". This repo restores the project
structure described in the Obsidian thesis notes and includes:

- an Expo Router mobile app with login, home, analytics, devices, scenes, and profile pages
- an Express API with thesis-mapped REST endpoints
- mock data that matches the thesis narrative around CO2 trends, alert settings, and scenes

## Structure

- `apps/mobile`: Expo Router React Native app
- `services/api`: Express REST API

## Thesis mapping

- Login page: user access boundary
- Home page: monitoring dashboard
- Analytics page: trend analysis and forecast warnings
- Devices page: device management and control
- Scenes page: linked automation execution
- Profile page: Bluetooth and maintenance entry

## Quick start

```bash
npm install
npm run dev:api
npm run dev:mobile
```

## API routes

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/devices`
- `PATCH /api/v1/devices/:id`
- `GET /api/v1/scenes`
- `POST /api/v1/scenes/:id/execute`
- `GET /api/v1/weather`
- `GET /api/v1/analytics/co2-trend`
- `GET /api/v1/analytics/co2-alert-settings`
- `PUT /api/v1/analytics/co2-alert-settings`
- `GET /api/v1/analytics/co2-alert-history`
