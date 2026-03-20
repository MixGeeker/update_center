# UName ERP Update Center

`update_center/` 现在是一个面向多发布对象的统一发布中心，而不再是“桌面端一套接口 + backend 一套接口”的双专用实现。

当前内建 3 个 `subject`：

| subjectId | 显示名 | 类型 | 主要能力 |
| --- | --- | --- | --- |
| `desktop_app` | Desktop App | desktop | release、stable 渠道、`/updates/...` 静态更新 |
| `edge_backend` | Edge Backend | service | release、testing/stable、compatibility、environment、deployment、artifact 分发 |
| `edge_farmer_worker` | Edge Farmer Worker | agent | release、testing/stable、environment、deployment、artifact 分发 |

> 研发阶段已直接切到新模型。旧的 `/api/admin/backend-*`、`/api/admin/channels`、`/backend/releases/*` 等专用接口不再作为正式入口维护。

## 访问入口

- 健康检查：`GET /api/health`
- 管理面板：`GET /admin/`
- 下载页：`GET /download/`
- 桌面端静态更新：`GET /updates/<channel>/...`
- 通用 artifact：`GET /artifacts/<subjectId>/releases/<version>/<file>`

## 标准化管理 API

所有管理接口统一收敛到：

- `GET /api/admin/subjects`
- `GET /api/admin/subjects/:subjectId`
- `POST /api/admin/subjects/:subjectId/releases/upload-sessions`
- `POST /api/admin/subjects/:subjectId/releases/upload-sessions/:sessionId/files/:slot`
- `POST /api/admin/subjects/:subjectId/releases/upload-sessions/:sessionId/finalize`
- `GET /api/admin/subjects/:subjectId/releases`
- `GET /api/admin/subjects/:subjectId/releases/details`
- `GET /api/admin/subjects/:subjectId/releases/:version`
- `DELETE /api/admin/subjects/:subjectId/releases/:version`
- `GET /api/admin/subjects/:subjectId/channels`
- `POST /api/admin/subjects/:subjectId/channels/:channel/promote`
- `POST /api/admin/subjects/:subjectId/channels/:channel/rollback`

仅支持 compatibility 的对象可用：

- `GET /api/admin/subjects/:subjectId/compatibility/active`
- `GET /api/admin/subjects/:subjectId/compatibility/:version`
- `PUT /api/admin/subjects/:subjectId/compatibility/:version`

仅支持环境与部署控制的对象可用：

- `GET /api/admin/subjects/:subjectId/environments`
- `GET /api/admin/subjects/:subjectId/environments/:environmentId`
- `GET /api/admin/subjects/:subjectId/environments/:environmentId/resolved`
- `PUT /api/admin/subjects/:subjectId/environments/:environmentId`
- `POST /api/admin/subjects/:subjectId/deployments`
- `GET /api/admin/subjects/:subjectId/deployments`
- `GET /api/admin/subjects/:subjectId/deployments/:deploymentId`
- `PUT /api/admin/subjects/:subjectId/deployments/:deploymentId`

## Internal API

供 agent / worker 使用的统一 internal 接口：

- `GET /api/internal/subjects/:subjectId/environments/:environmentId/resolved`
- `GET /api/internal/subjects/:subjectId/releases/:version`
- `GET /api/internal/subjects/:subjectId/deployments/next?environmentId=...`
- `POST /api/internal/subjects/:subjectId/deployments/:deploymentId/actions/claim`
- `PUT /api/internal/subjects/:subjectId/deployments/:deploymentId`

## 静态分发规则

### `desktop_app`

保留 Electron Generic Provider 所需的 URL 形态：

- `/updates/stable/latest.yml`
- `/updates/stable/latest-mac.yml`
- `/updates/stable/latest-linux.yml`
- `/updates/stable/<installer>`

### `edge_backend`

通过通用 artifact 路径暴露发布产物：

- `/artifacts/edge_backend/releases/<version>/release-manifest.json`
- `/artifacts/edge_backend/releases/<version>/<image-file>.tar`
- `/artifacts/edge_backend/releases/<version>/checksums.txt`

### `edge_farmer_worker`

- `/artifacts/edge_farmer_worker/releases/<version>/release-manifest.json`
- `/artifacts/edge_farmer_worker/releases/<version>/<image-file>.tar`
- `/artifacts/edge_farmer_worker/releases/<version>/checksums.txt`

## 更新数据目录结构

服务通过 `UPDATE_DATA_DIR` 指向统一数据根目录：

```text
<UPDATE_DATA_DIR>/
  subjects/
    desktop_app/
      releases/
      channels/
        stable/
        .stable-state.json
      runtime/
        upload-sessions/
    edge_backend/
      releases/
      channels/
        testing/
        stable/
        .testing-state.json
        .stable-state.json
      runtime/
        upload-sessions/
        compatibility/
        environments/
        deployments/
    edge_farmer_worker/
      releases/
      channels/
        testing/
        stable/
        .testing-state.json
        .stable-state.json
      runtime/
        upload-sessions/
        environments/
        deployments/
```

说明：

- 桌面端仍然通过 `desktop_app/channels/stable` 映射到 `/updates/stable/...`
- 服务类 subject 的产物统一从 `/artifacts/<subjectId>/...` 对外分发
- `edge_backend` 默认会 seed 一个 `mac-prod` 环境文件

## 环境变量

项目通过 `.env` 读取配置，模板见 `env.example`。

关键变量：

- `PORT`：监听端口，默认 `8600`
- `UPDATE_ADMIN_TOKEN`：管理接口 Bearer Token，必填
- `UPDATE_DATA_DIR`：更新数据目录
- `TRUST_PROXY`：反向代理场景建议设为 `1`

Docker Compose 辅助变量：

- `UPDATE_DATA_DIR_HOST`：宿主机上的数据目录
- `UPDATE_CENTER_USER`：容器用户，默认 `1001:1001`

## 运行方式

### Docker Compose

```bash
cp env.example .env
docker compose up -d --build
docker compose logs -f update-center
```

### 本机运行

```bash
npm ci
npm run start:dev
```

生产模式：

```bash
npm run build
npm run start:prod
```

未设置 `UPDATE_DATA_DIR` 时，默认使用 `update_center/data/updates`。

## 桌面端发布示例

### 1. 创建 upload session

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"0.5.2\"}" \
  http://localhost:8600/api/admin/subjects/desktop_app/releases/upload-sessions
```

### 2. 上传文件

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@./dist/latest.yml" \
  "http://localhost:8600/api/admin/subjects/desktop_app/releases/upload-sessions/<sessionId>/files/artifact?fileName=latest.yml"
```

### 3. finalize

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{}" \
  http://localhost:8600/api/admin/subjects/desktop_app/releases/upload-sessions/<sessionId>/finalize
```

### 4. 发布到 stable

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"0.5.2\"}" \
  http://localhost:8600/api/admin/subjects/desktop_app/channels/stable/promote
```

## Edge Backend 发布示例

### 1. 创建 upload session

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"1.2.3\"}" \
  http://localhost:8600/api/admin/subjects/edge_backend/releases/upload-sessions
```

### 2. 上传镜像 tar

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@./uname-erp-server-1.2.3-linux-arm64.tar" \
  "http://localhost:8600/api/admin/subjects/edge_backend/releases/upload-sessions/<sessionId>/files/image?fileName=uname-erp-server-1.2.3-linux-arm64.tar"
```

可选上传 `checksums.txt`：

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@./checksums.txt" \
  "http://localhost:8600/api/admin/subjects/edge_backend/releases/upload-sessions/<sessionId>/files/checksums?fileName=checksums.txt"
```

### 3. finalize

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d @./release-manifest.json \
  http://localhost:8600/api/admin/subjects/edge_backend/releases/upload-sessions/<sessionId>/finalize
```

`finalize` body 可附带：

- `channel: "testing"` 或 `channel: "stable"`
- `desktopCompatibility`
- `imageTag`
- `imageRepository`
- `gitCommit`
- `sourceRef`
- `buildTime`
- `notes`
- `composeProfileSet`
- `migrationPolicy`

如果直接推入 `stable`，则必须同时提供有效的 `desktopCompatibility`。

### 4. 渠道管理

```bash
curl -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  http://localhost:8600/api/admin/subjects/edge_backend/channels
```

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"1.2.3\"}" \
  http://localhost:8600/api/admin/subjects/edge_backend/channels/testing/promote
```

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"1.2.3\"}" \
  http://localhost:8600/api/admin/subjects/edge_backend/channels/stable/promote
```

### 5. 兼容策略

```bash
curl -X PUT \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"desktopMinVersion\":\"0.8.0\",\"desktopRecommendedVersion\":\"0.8.4\",\"enforceMode\":\"warn\"}" \
  http://localhost:8600/api/admin/subjects/edge_backend/compatibility/1.2.3
```

### 6. 环境与部署

查询环境：

```bash
curl -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  http://localhost:8600/api/admin/subjects/edge_backend/environments
```

写入环境：

```bash
curl -X PUT \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -H "x-uname-actor: admin-ui" \
  -d "{\"releaseChannel\":\"stable\",\"agentBaseUrl\":\"http://127.0.0.1:3901\",\"services\":[\"edge_backend\"]}" \
  http://localhost:8600/api/admin/subjects/edge_backend/environments/mac-prod
```

创建部署：

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"environmentId\":\"mac-prod\",\"channel\":\"stable\",\"triggerMode\":\"manual\"}" \
  http://localhost:8600/api/admin/subjects/edge_backend/deployments
```

## 下载页

给终端用户的网页下载入口保持不变：

- `GET /download/`
- `GET /api/downloads/<channel>/latest`
- `GET /api/downloads/<channel>/latest/{win|mac|linux|auto}`

这些接口始终读取 `desktop_app` 的 stable/update 数据。

## 管理面板

访问 `http://<host>:8600/admin/` 后：

1. 输入 `UPDATE_ADMIN_TOKEN`
2. 顶部会显示 `subject` 总览
3. 当前内建操作面板包含：
   - `desktop_app`
   - `edge_backend`

`edge_farmer_worker` 已注册到平台，当前可通过标准 subject API 管理。

## 提交前最少验证

```bash
npm run build
```

再手工验证：

- `GET /api/health`
- `GET /api/admin/subjects`
- `GET /api/admin/subjects/desktop_app/channels`
- `GET /api/admin/subjects/edge_backend/channels`
- `GET /api/downloads/stable/latest`

## 常见问题

### 1. `UPDATE_ADMIN_TOKEN is not configured`

说明 `.env` 未配置 `UPDATE_ADMIN_TOKEN`。

### 2. 桌面端下载 404

通常是 `desktop_app/channels/stable` 缺少 `latest*.yml` 或安装包。

### 3. Edge Backend artifact 404

通常是：

- 版本目录不存在
- `release-manifest.json` 中引用的文件未上传
- 请求路径仍在使用已废弃的 `/backend/releases/...`

### 4. Docker 数据目录无权限

优先修正宿主机目录权限；仅在临时排障时再考虑把 `UPDATE_CENTER_USER` 改为 `0:0`。
