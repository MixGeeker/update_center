# Update Center Agent 指南（中文）

> 作用范围：`update_center/` 目录及其所有子目录。

## 0. 总则（必须遵守）
- 本模块是 **独立 Git 仓库**；安装依赖、运行命令、提交代码均在 `update_center/` 内执行。
- 回复、方案、注释优先使用 **简体中文**。
- 禁止提交密钥/口令；不要提交 `.env`。如需新增/修改环境变量，必须同步更新 `env.example` 与 `README.md`。

## 1. 模块定位与关键路径
- 技术栈：NestJS + `@nestjs/serve-static`。
- 主要职责：
  - 提供更新静态资源：`/updates/<channel>/...`
  - 提供管理面板与管理 API：`/admin/`、`/api/admin/*`
  - 提供下载页与下载 API：`/download/`、`/api/downloads/*`
  - 提供健康检查：`/api/health`
- 关键目录：
  - `src/admin/`：stable 发布、回滚、清理、状态查询
  - `src/downloads/`：下载页与“最新直链”能力
  - `src/updates/`：更新数据目录解析与初始化
  - `public/admin/`、`public/download/`：静态页面资源

## 2. 常用命令
```bash
npm ci
npm run start:dev
npm run build
npm run start:prod
```

可选（容器部署）：
```bash
docker compose up -d --build
docker compose logs -f update-center
```

## 3. 开发约定（更新链路相关）
- **以当前 `subject` 标准接口为准**：研发阶段不保留旧 `backend-*` 专用接口；若改动 `/api/admin/subjects/*`、`/api/internal/subjects/*`、`/api/downloads/*`，必须同步更新管理面板、脚本与 `README.md`。
- **路径安全优先**：涉及版本号/目录名时，沿用现有安全校验（如 `validateVersionSafe`）；禁止路径穿越、禁止拼接未校验输入。
- **稳定通道语义保持**：
  - `promoteStable` 发布时保持 `previousVersions` 回滚链去重与长度限制。
  - 仅保留历史 `*.blockmap` 用于差分更新，不恢复旧安装包到 stable。
- **静态缓存策略谨慎修改**：`latest*.yml` 应保持 `no-cache`，安装包/静态大文件保持长缓存；变更前评估客户端更新行为。
- **鉴权不可弱化**：管理接口继续使用 Bearer Token（`UPDATE_ADMIN_TOKEN`），禁止降级为无鉴权或弱鉴权。

## 4. 提交前自检
- 至少执行：`npm run build`（确保 TS 编译通过）。
- 涉及更新流程改动时，至少手工验证：
  - `GET /api/health`
  - `GET /api/admin/subjects`（带 token）
  - `GET /api/admin/subjects/desktop_app/channels`（带 token）
  - `GET /api/admin/subjects/edge_backend/channels`（带 token）
  - `POST /api/admin/subjects/desktop_app/channels/stable/promote`（带 token）
  - `GET /api/downloads/stable/latest`

## 5. 变更边界与文档同步
- 不要手工改 `dist/`、不要提交 `node_modules/`。
- 任何会影响部署、目录结构、环境变量、对外接口的改动，必须同步更新 `README.md`。
- 若新增模块内专项规范，可在子目录继续放置更近层级的 `AGENTS.md`，就近覆盖。
