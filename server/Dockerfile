# syntax=docker/dockerfile:1.7

# 依赖阶段：只安装 JavaScript 依赖
FROM node:24-bookworm-slim AS deps

# 国内服务器构建时可通过 docker compose build --build-arg 覆盖 npm 镜像源
ARG NPM_REGISTRY=https://registry.npmmirror.com

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖（包括生产依赖）
RUN npm ci --omit=dev --registry="${NPM_REGISTRY}"

# 运行阶段：只保留运行所需依赖，减小镜像体积
FROM node:24-bookworm-slim

# 国内服务器构建时可通过 docker compose build --build-arg 覆盖 Debian 镜像源
ARG DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn

# 设置工作目录
WORKDIR /app

# 安装健康检查工具（先把 Debian 官方源换成国内镜像，避免 CJK 字体下载过慢）
RUN for f in /etc/apt/sources.list /etc/apt/sources.list.d/debian.sources; do \
        [ -f "$f" ] && sed -i "s#deb.debian.org#${DEBIAN_MIRROR}#g; s#security.debian.org#${DEBIAN_MIRROR}#g" "$f" || true; \
    done; \
    apt-get update && apt-get install -y --no-install-recommends wget ca-certificates fonts-dejavu-core fonts-noto-cjk && \
    rm -rf /var/lib/apt/lists/*

# 复制生产依赖
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# 复制应用代码
COPY . .

# 创建数据目录并设置权限
RUN mkdir -p /app/data && \
    chmod 777 /app/data

# 暴露端口（默认3002，可通过环境变量修改）
EXPOSE 3002

# 设置环境变量（可以被docker-compose覆盖）
ENV NODE_ENV=production

# 启动应用
CMD ["npm", "start"]
