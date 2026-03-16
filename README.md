# UName ERP Update Center（统一发布中心）

本目录是 UName ERP 桌面端的更新中心服务，技术栈为 **Node.js + NestJS**。

它现在的职责是：

- 对外提供 **静态更新资源**（供 `electron-updater` / Generic Provider 拉取）：`/updates/<channel>/...`
- 提供 **管理面板**（发布 stable、回滚）：`/admin/`（需要 Token）
- 提供 **网页下载页与“最新直链”**（给用户手动下载安装）：`/download/`、`/api/downloads/...`
- 提供 **后端发布管理 API**：backend release 上传、testing/stable 双渠道流转、桌面端兼容策略映射
- 提供 **后端部署任务队列**：创建部署任务记录，作为后续宿主执行器（deploy-agent）的控制面
- 提供 **健康检查**：`/api/health`（Docker healthcheck 会用到）

> 注意：仓库根目录不是单一 Git 仓库；`update_center/` 是一个独立模块（内有自己的 `.git/`）。请在 `update_center/` 目录执行安装/构建/运行命令。

---

## 访问入口与接口一览

- **健康检查**：`GET /api/health`
- **管理面板（静态页）**：`GET /admin/`
- **管理 API（需 Bearer Token）**
  - `GET /api/admin/releases`：列出已上传的版本目录
  - `GET /api/admin/releases/details`：列出版本详情（大小/文件数/保护状态）
  - `DELETE /api/admin/releases/<version>?force=1`：删除指定版本的 `releases/<version>/`（默认保护 stable 相关版本；`force=1` 强制）
  - `GET /api/admin/channels`：查询 stable 状态
  - `POST /api/admin/channels/stable/promote`：发布 stable
  - `POST /api/admin/channels/stable/rollback`：回滚 stable
  - `POST /api/admin/releases/upload-sessions`：创建桌面端 release 上传会话
  - `POST /api/admin/releases/upload-sessions/<sessionId>/files?fileName=...`：上传桌面端产物，支持分片
  - `POST /api/admin/releases/upload-sessions/<sessionId>/finalize`：将会话内文件合并写入 `releases/<version>/`
  - `POST /api/admin/backend-releases/upload-sessions`：创建后端 release 上传会话
  - `POST /api/admin/backend-releases/upload-sessions/<sessionId>/files/{image|checksums}?fileName=...`：上传后端 tar / checksum 文件（原始二进制流）
  - `POST /api/admin/backend-releases/upload-sessions/<sessionId>/finalize`：写入 manifest，可选直接推入 `testing` 或 `stable`
  - `GET /api/admin/backend-releases`：列出后端版本
  - `GET /api/admin/backend-releases/details`：列出后端版本详情
  - `GET /api/admin/backend-releases/<version>`：查询单个后端版本
  - `DELETE /api/admin/backend-releases/<version>?force=1`：删除后端版本（不会删除当前 active 版本）
  - `GET /api/admin/backend-channels`：查询后端 `testing/stable` 渠道状态
  - `POST /api/admin/backend-channels/<testing|stable>/promote`：将后端版本推入目标渠道
  - `POST /api/admin/backend-channels/<testing|stable>/rollback`：按回滚链回退
  - `PUT /api/admin/backend-compatibility/<backendVersion>`：写入桌面端兼容策略
  - `GET /api/admin/backend-compatibility/<backendVersion>`：查询指定后端版本的兼容策略
  - `GET /api/admin/backend-compatibility/active`：查询当前 stable 后端版本对应的兼容策略
  - `POST /api/admin/backend-deployments`：创建后端部署任务
  - `GET /api/admin/backend-deployments`：查询后端部署任务列表
  - `GET /api/admin/backend-deployments/<deploymentId>`：查询单个部署任务
- **更新资源（静态目录）**：`GET /updates/<channel>/...`
  - 典型：`/updates/stable/latest.yml`、`/updates/stable/<installer>`
- **网页下载（给浏览器用户）**
  - 下载页：`GET /download/`
  - 查询（JSON）：`GET /api/downloads/<channel>/latest`
  - 最新直链（302 跳转到 `/updates/...`）：`GET /api/downloads/<channel>/latest/{win|mac|linux|auto}`

---

## 更新数据目录结构（很重要）

服务通过 `UPDATE_DATA_DIR` 指向“更新数据根目录”，目录结构约定如下：

```text
<UPDATE_DATA_DIR>/
  releases/
    <version>/                 # CI 上传产物（按版本分目录）
      latest.yml
      latest-mac.yml
      latest-linux.yml
      <installer>              # 例如 *.exe / *.dmg / *.AppImage
      *.blockmap               # 差分更新用（可选但推荐保留）
  channels/
    stable/                    # 客户端默认拉取的稳定渠道入口
      latest.yml
      ...
    .stable-state.json         # stable 发布状态（点文件，不对外暴露）
  runtime/
    upload-sessions/
      <sessionId>.json
      <sessionId>/
  backend/
    releases/
      <version>/
        release-manifest.json
        uname-erp-server-<version>-arm64.tar
        checksums.txt
    channels/
      testing/
      stable/
      .testing-state.json
      .stable-state.json
    runtime/
      compatibility/
        <version>.json
      deployments/
        <deploymentId>.json
      environments/
        mac-prod.json
      upload-sessions/
        <sessionId>.json
        <sessionId>/
```

发布 stable 时，服务会将 `releases/<version>/` 的内容“硬链接/复制”到 `channels/stable/`，并维护 `.stable-state.json` 以支持回滚与保留历史 `*.blockmap`（便于差分下载）。

桌面端与后端现在都支持 upload session，但目录树仍然分离：桌面端保持原有 `releases/` / `channels/` 结构，后端能力统一落到 `backend/**`，互不影响。

---

## 环境变量配置（必须）

项目通过 `.env` 读取配置；仓库提供 `env.example` 作为模板。

### 1) 创建 `.env`

在 `update_center/` 目录下执行：

```bash
# macOS / Linux
cp env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .\env.example .\.env
```

### 2) 关键变量说明

- **`PORT`**：对外监听端口（默认 `8600`）
- **`UPDATE_ADMIN_TOKEN`**：管理 API 的 Bearer Token（必填）
- **`UPDATE_DATA_DIR`**：更新数据目录（本机运行可用相对/绝对路径；Docker 场景见下文 volume）
- **`TRUST_PROXY`**：若前面有 Nginx/1panel 反代，建议设置为 `1`

Docker Compose 辅助变量（仅 compose 文件使用，服务本身不读取）：

- **`UPDATE_DATA_DIR_HOST`**：宿主机上的更新数据目录，用于挂载到容器的 `UPDATE_DATA_DIR`
- **`UPDATE_CENTER_USER`**：容器运行用户（默认 `1001:1001`，宿主机权限难处理时可临时用 `0:0`）

---

## 方式 A：Docker Compose 部署（推荐）

### 1) 准备 `.env`

按上文从 `env.example` 复制生成 `.env` 并填写至少：

- `UPDATE_ADMIN_TOKEN`
- `UPDATE_DATA_DIR_HOST`（宿主机目录，确保存在且有权限）

### 2) 构建并启动

在 `update_center/` 目录执行：

```bash
docker compose up -d --build
```

### 3) 查看日志 / 健康状态

```bash
docker compose logs -f update-center
```

健康检查会访问容器内 `http://localhost:8600/api/health`。

### 4) 访问验证

- 健康检查：`http://localhost:8600/api/health`
- 管理面板：`http://localhost:8600/admin/`
- 下载页：`http://localhost:8600/download/`
- 更新目录：`http://localhost:8600/updates/stable/`

---

## 方式 A-2：Docker Compose（使用预构建镜像）

适用场景：交付部署时不希望在目标机器上进行源码构建（已通过 `docker load` 或镜像仓库准备好镜像）。

在 `update_center/` 目录执行：

```bash
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f update-center
```

---

## 方式 B：本机运行（Node.js）

### 1) 前置要求

- **Node.js 20+**

### 2) 安装依赖

在 `update_center/` 目录执行：

```bash
npm ci
```

### 3) 启动（开发）

```bash
npm run start:dev
```

### 4) 启动（生产）

```bash
npm run build
npm run start:prod
```

不设置 `UPDATE_DATA_DIR` 时，默认会使用 `update_center/data/updates` 作为数据目录，并在启动时自动创建所需子目录。

---

## 上传桌面端版本产物（releases/<version>）

桌面端更新中心现在支持两种方式：

- 推荐：通过 **HTTP upload session** 上传桌面端产物，适合 GitHub Actions、自建 runner、Cloudflare 反代环境
- 兼容：继续允许运维通过 `rsync/scp` 直接把构建产物放入数据目录的 `releases/<version>/`

要求：

- 版本目录名建议使用 `0.5.2` 这种形式（管理接口也会将 `v0.5.2` 规范化为 `0.5.2`）
- 目录内应包含 `electron-builder` 生成的 `latest*.yml` 与对应安装包文件
- 如需差分更新，建议同时保留 `*.blockmap`

示例（以宿主机目录为例，假设 `.env` 配置 `UPDATE_DATA_DIR_HOST=/data/update_center/updates`）：

```text
/data/update_center/updates/releases/0.5.2/
  latest.yml
  UName ERP Setup 0.5.2.exe
  UName ERP Setup 0.5.2.exe.blockmap
```

### 1) 创建 upload session

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"0.5.2\"}" \
  http://localhost:8600/api/admin/releases/upload-sessions
```

### 2) 上传桌面端文件

单请求上传示例：

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@./dist/latest.yml" \
  "http://localhost:8600/api/admin/releases/upload-sessions/<sessionId>/files?fileName=latest.yml"
```

分片上传示例：

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@./chunk-000.bin" \
  "http://localhost:8600/api/admin/releases/upload-sessions/<sessionId>/files?fileName=UName%20ERP%20Setup%200.5.2.exe&chunkIndex=0&totalChunks=4&totalSizeBytes=734003200"
```

说明：

- 同一个 session 内可以上传多个文件
- 同一个版本可以由多个 session 分别上传不同平台产物，finalize 时会合并进入同一个 `releases/<version>/`
- chunk 必须按顺序上传，从 `chunkIndex=0` 开始
- 最后一片上传完成后，该文件才会被标记为上传完成

### 3) finalize 写入 releases/<version>

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{}" \
  http://localhost:8600/api/admin/releases/upload-sessions/<sessionId>/finalize
```

### 4) 兼容的直写目录方式

如果你仍然使用 `rsync/scp`，也可以直接把产物放到版本目录：

```bash
rsync -av ./dist/ user@server:/data/update_center/updates/releases/0.5.2/
```

上传完成后，再通过管理面板/API 将该版本发布到 stable。

---

## 后端版本上传与渠道管理

后端 release 使用 **HTTP upload session**，不再要求 CI 直接操作宿主机目录。

### 1) 后端 release 目录内容

每个后端版本目录至少包含：

```text
backend/releases/<version>/
  release-manifest.json
  uname-erp-server-<version>-arm64.tar
  checksums.txt
```

其中：

- `release-manifest.json`：描述镜像 tar 文件名、tag、构建提交、迁移策略、compose profiles 等
- `*.tar`：`docker save` 导出的 `linux/arm64` 镜像包
- `checksums.txt`：校验文件；若 CI 未上传，服务会在 finalize 时自动生成

### 2) 创建 upload session

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"1.2.3\"}" \
  http://localhost:8600/api/admin/backend-releases/upload-sessions
```

### 3) 上传镜像 tar

支持两种模式：

- 小文件可直接单请求上传
- 大文件建议使用分片上传，适合经过 Cloudflare 等网关时规避 `413 Payload Too Large`

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@./uname-erp-server-1.2.3-arm64.tar" \
  "http://localhost:8600/api/admin/backend-releases/upload-sessions/<sessionId>/files/image?fileName=uname-erp-server-1.2.3-arm64.tar"
```

可选：上传 `checksums.txt`

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@./checksums.txt" \
  "http://localhost:8600/api/admin/backend-releases/upload-sessions/<sessionId>/files/checksums?fileName=checksums.txt"
```

分片上传示例（把大 tar 切成多个顺序 chunk）：

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary "@./chunk-000.bin" \
  "http://localhost:8600/api/admin/backend-releases/upload-sessions/<sessionId>/files/image?fileName=uname-erp-server-1.2.3-arm64.tar&chunkIndex=0&totalChunks=4&totalSizeBytes=734003200"
```

说明：

- chunk 必须按顺序上传，从 `chunkIndex=0` 开始
- `totalChunks` / `totalSizeBytes` 在同一个文件上传过程中必须保持一致
- 最后一个 chunk 完成后，服务端才会把该文件标记为已上传完成

### 4) finalize 并可选推进 testing/stable

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d @./release-manifest.json \
  http://localhost:8600/api/admin/backend-releases/upload-sessions/<sessionId>/finalize
```

你可以在 finalize body 中附带：

- `channel: "testing"`：上传完成后直接推入 testing
- `desktopCompatibility`：同时写入桌面端兼容策略

注意：

- 直接推入 `stable` 时，必须同时具备有效的 `desktopCompatibility`
- `desktopCompatibility.desktopRecommendedVersion` 必须在 update_center 内能解析到桌面端版本

### 5) 双渠道

后端双渠道采用“发布渠道”语义：

- `testing`：验证通道
- `stable`：生产通道

接口：

- `GET /api/admin/backend-channels`
- `POST /api/admin/backend-channels/testing/promote`
- `POST /api/admin/backend-channels/testing/rollback`
- `POST /api/admin/backend-channels/stable/promote`
- `POST /api/admin/backend-channels/stable/rollback`

### 6) 兼容策略

后端版本可绑定桌面端兼容策略，字段包括：

- `desktopMinVersion`
- `desktopRecommendedVersion`
- `desktopMaxVersion`（可选）
- `enforceMode`：`none | warn | hard_block`
- `notes`（可选）

示例：

```bash
curl -X PUT \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"desktopMinVersion\":\"0.8.0\",\"desktopRecommendedVersion\":\"0.8.4\",\"enforceMode\":\"warn\"}" \
  http://localhost:8600/api/admin/backend-compatibility/1.2.3
```

### 7) 部署任务队列

当前版本的 `update_center` 已支持创建后端部署任务记录，供后续宿主执行器消费：

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"channel\":\"stable\",\"environmentId\":\"mac-prod\"}" \
  http://localhost:8600/api/admin/backend-deployments
```

这一步会生成 `backend/runtime/deployments/<deploymentId>.json`。当前它是发布控制面的任务落盘能力，后续可由 `deploy-agent` 认领执行。

---

## 发布 stable（管理面板 / API）

### 方式 1：管理面板（推荐）

1. 打开 `http://<host>:8600/admin/`
2. 在页面中填写 `UPDATE_ADMIN_TOKEN`（仅存浏览器 localStorage，不会上传）
3. 点击“刷新”，确认能看到 releases 列表
4. 对目标版本点击“发布到 stable”

### 方式 2：调用 API（便于脚本化）

```bash
curl -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" http://localhost:8600/api/admin/releases
```

```bash
curl -X POST \
  -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{\"version\":\"0.5.2\"}" \
  http://localhost:8600/api/admin/channels/stable/promote
```

---

## 清理 releases（手动）

用于释放磁盘空间：删除历史版本目录 `releases/<version>/`。

重要说明：

- 删除 `releases/<version>` **不会影响** 当前 `/updates/stable/` 的静态文件（stable 已通过硬链接/复制持有文件）。
- 但会影响 **回滚能力**：被删除的版本无法再通过 promote/rollback 切回。
- 默认情况下，服务会保护 stable 当前版本与回滚链中的版本；如确需删除，请在管理面板勾选“强制删除”或在 API 中带 `force=1`。

### 管理面板

打开 `http://<host>:8600/admin/`，刷新后在版本列表中点击“删除版本”。

### API 示例

查看版本详情（含大小与保护状态）：

```bash
curl -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" http://localhost:8600/api/admin/releases/details
```

删除某个版本（非受保护版本）：

```bash
curl -X DELETE -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" http://localhost:8600/api/admin/releases/0.5.0
```

强制删除（允许删除 stable 回滚链引用的版本）：

```bash
curl -X DELETE -H "Authorization: Bearer <UPDATE_ADMIN_TOKEN>" "http://localhost:8600/api/admin/releases/0.4.9?force=1"
```

---

## 网页直链下载（给用户手动下载安装）

### 1) 下载页

访问：`http://<host>:8600/download/`

页面上的按钮会调用“最新直链接口”，并跳转到 `/updates/stable/<installer>` 的真实文件地址。

### 2) 固定“最新直链”

你可以把下面链接直接发给用户（永远指向最新 stable 安装包）：

- Windows：`/api/downloads/stable/latest/win`
- macOS：`/api/downloads/stable/latest/mac`
- Linux：`/api/downloads/stable/latest/linux`
- 自动识别：`/api/downloads/stable/latest/auto`（根据 `User-Agent` 判断平台）

说明：

- 该接口会从 `channels/<channel>/latest*.yml` 读取 `path:` 字段，解析出安装包文件名并做安全校验（禁止路径穿越）。
- 若缺少 `latest*.yml` 或安装包文件不存在，会返回 404（通常意味着还没发布 stable 或产物不完整）。

---

## 反向代理与缓存说明

- 若前面有 Nginx/1panel 反代，建议设置 `TRUST_PROXY=1`（服务会信任 1 层代理）。
- `/updates/...` 静态资源的缓存策略：
  - `latest*.yml`：`Cache-Control: no-cache`（避免客户端拿到旧版本描述）
  - 其他文件：`Cache-Control: public, max-age=31536000, immutable`（大文件长期缓存）
- `/api/downloads/.../latest/...` 直链跳转会返回 `Cache-Control: no-cache`，避免浏览器缓存“旧版本跳转”。

---

## 常见问题（部署排障）

### 1) 管理 API 报错：`UPDATE_ADMIN_TOKEN is not configured`

原因：`.env` 未配置 `UPDATE_ADMIN_TOKEN`（该值必填）。

### 2) 下载直链返回 404：`latest yml not found` / `installer file not found`

原因：stable 目录没有对应 `latest*.yml` 或安装包文件。

处理：

- 确认 `releases/<version>/` 中产物完整（包含 `latest*.yml` 与安装包）
- 通过管理面板将该版本发布到 stable

### 3) Docker 启动后提示权限问题（无法读写数据目录）

处理顺序建议：

1. 优先修正宿主机目录权限/属主，让容器用户（默认 `1001:1001`）可读写
2. 临时方案：在 `.env` 中将 `UPDATE_CENTER_USER=0:0`（不推荐长期使用）
