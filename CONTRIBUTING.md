# 贡献规范

## 仓库结构

- `apps/mobile`：Expo Router 移动端应用
- `services/api`：Express API

## 常用命令

```bash
npm install
npm run dev:api
npm run dev:mobile
npm run lint
```

## Reviewer / Sourcery 会重点看什么

- API route contract、鉴权、参数与 mock 数据是否稳定
- 移动端页面是否仍符合 thesis mapping
- 页面导航、状态切换、错误态与空态是否完整
- 前端展示字段是否与 API / mock 响应保持一致

## PR 期望内容

每个 PR 请说明：

1. 影响了哪些页面 / 接口
2. 是否有 contract 变化
3. 你的验证步骤是什么
4. 可见改动的截图或录屏是什么

## 跳过 Sourcery 的规则

默认不要跳过。如果确实需要跳过，请在 PR 上加：

- `skip-sourcery`
- `no-sourcery`
- `sourcery-ignore`

并在 PR 描述里说明原因。
