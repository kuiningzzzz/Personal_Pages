# syntax=docker/dockerfile:1.7

# 依赖构建阶段：better-sqlite3 需要编译工具
FROM node:20-alpine3.20 AS deps

# 国内服务器构建时可通过 docker compose build --build-arg 覆盖镜像源
ARG ALPINE_MIRROR=https://mirrors.aliyun.com/alpine
ARG NPM_REGISTRY=https://registry.npmmirror.com

# 设置工作目录
WORKDIR /app

# 安装构建依赖（better-sqlite3 需要这些依赖来编译）
RUN sed -i "s#https://dl-cdn.alpinelinux.org/alpine#${ALPINE_MIRROR}#g" /etc/apk/repositories && \
    apk add --no-cache python3 make g++

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖（包括生产依赖）
RUN npm ci --omit=dev --registry="${NPM_REGISTRY}"

# 运行阶段：只保留运行所需依赖，减小镜像体积
FROM node:20-alpine3.20

ARG ALPINE_MIRROR=https://mirrors.aliyun.com/alpine

# 设置工作目录
WORKDIR /app

# 安装运行时依赖和健康检查工具
RUN sed -i "s#https://dl-cdn.alpinelinux.org/alpine#${ALPINE_MIRROR}#g" /etc/apk/repositories && \
    apk add --no-cache libstdc++ wget

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
