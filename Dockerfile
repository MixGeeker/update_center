# ============================================
# Update Center - Production Dockerfile
# 多阶段构建，优化镜像体积
# ============================================

# ============================================
# 阶段 1: 构建阶段
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# 复制依赖文件
COPY package*.json ./

# 安装所有依赖（包含 devDependencies，用于 nest build）
RUN npm ci

# 复制源代码
COPY . .

# 构建
RUN npm run build

# ============================================
# 阶段 2: 生产阶段
# ============================================
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# 健康检查需要 wget（alpine busybox 通常自带，但显式安装更稳）
RUN apk add --no-cache wget

# 复制 package 文件
COPY package*.json ./

# 仅安装生产依赖
RUN npm ci --omit=dev && npm cache clean --force

# 复制编译后的代码
COPY --from=builder /app/dist ./dist

# 复制静态资源（管理面板）
COPY --from=builder /app/public ./public

# 创建非 root 用户运行应用（安全最佳实践）
RUN addgroup -g 1001 -S nodejs && \
    adduser -S updatecenter -u 1001 -G nodejs && \
    mkdir -p /data/update_center/updates && \
    chown -R updatecenter:nodejs /app /data/update_center

USER updatecenter

EXPOSE 8600

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8600/api/health || exit 1

CMD ["node", "dist/main.js"]
