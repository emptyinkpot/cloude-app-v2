# cloude-app Review Guide

## 常用命令

```bash
npm install
npm run dev:api
npm run dev:mobile
npm run lint
```

## 仓库专属审查重点

1. `services/api/**` 相关变更要重点检查：
   - 是否破坏了 thesis-mapped API 契约、鉴权边界、参数校验或 mock 数据结构；
   - 是否让 `/api/v1/health`、`/auth`、`/devices`、`/scenes`、`/analytics` 路由行为前后不一致。
2. `apps/mobile/**` 相关变更要重点检查：
   - Expo Router 导航是否仍正确；
   - 登录、首页、分析、设备、场景、个人页的 loading / empty / error 状态是否完备；
   - UI 展示字段是否仍与 API / mock contract 对齐。
3. 用户可见改动必须提供可见验证：
   - 页面截图、录屏、Expo 运行图，或等价证据；
   - 仅给 lint 通过或接口 200 不算完成前端验证。

## PR 要求

- PR 描述要列出涉及的页面、路由和接口。
- 如果改了接口 contract，必须同步说明移动端受到的影响。
- 如果改了移动端可见界面，必须附图或录屏。
- 只有在明确需要跳过审查时才使用 `skip-sourcery`、`no-sourcery` 或 `sourcery-ignore`。
