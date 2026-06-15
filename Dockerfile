# syntax=docker/dockerfile:1.7

# 构建阶段
FROM node:20-alpine3.20 AS builder

# 国内服务器构建时可通过 docker compose build --build-arg 覆盖镜像源
ARG NPM_REGISTRY=https://registry.npmmirror.com

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装所有依赖（包括 devDependencies，构建时需要）
RUN npm ci --registry="${NPM_REGISTRY}"

# 复制项目文件
COPY . .

# 构建生产环境代码
RUN npm run build

# 生产阶段
FROM nginx:alpine

ARG ALPINE_MIRROR=https://mirrors.aliyun.com/alpine

# 安装 wget 用于健康检查
RUN sed -i "s#https://dl-cdn.alpinelinux.org/alpine#${ALPINE_MIRROR}#g" /etc/apk/repositories && \
    apk add --no-cache wget

# 复制构建产物到 nginx 目录
COPY --from=builder /app/dist /usr/share/nginx/html

# 复制 public 目录（文章和图片资源）
COPY --from=builder /app/public /usr/share/nginx/html

# 复制 nginx 配置文件
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 暴露端口
EXPOSE 80 443

# 启动 nginx
CMD ["nginx", "-g", "daemon off;"]
