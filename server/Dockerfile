# 使用官方 Node.js 镜像作为基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 安装构建依赖（better-sqlite3 需要这些依赖来编译）
RUN apk add --no-cache python3 make g++

# 复制 package.json 和 package-lock.json（如果存在）
COPY package*.json ./

# 安装依赖（包括生产依赖）
RUN npm ci --only=production

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
