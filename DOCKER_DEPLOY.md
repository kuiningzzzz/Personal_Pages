# Docker 部署指南

## 快速开始

### 1. 构建并启动服务

在项目根目录运行：

```bash
docker-compose up -d
```

这将会：
- 构建后端服务的 Docker 镜像
- 启动后端容器
- 在后台运行服务（`-d` 参数）

### 2. 查看服务状态

```bash
docker-compose ps
```

### 3. 查看日志

```bash
# 查看所有服务日志
docker-compose logs

# 实时查看日志
docker-compose logs -f

# 查看后端服务日志
docker-compose logs backend
```

### 4. 停止服务

```bash
docker-compose down
```

### 5. 重新构建并启动

如果修改了代码，需要重新构建镜像：

```bash
docker-compose up -d --build
```

## 服务配置

### 后端服务

- **端口**: 3002（可在 docker-compose.yml 中修改）
- **数据持久化**: 数据库文件 `database.sqlite` 挂载到主机
- **环境变量**: 通过 `.env` 文件配置
- **健康检查**: 每30秒检查一次服务状态

### 环境变量配置

在 `server/.env` 文件中配置：

```env
SERVER_PORT=3002
```

## 常用命令

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose down

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 进入容器
docker-compose exec backend sh

# 查看服务状态
docker-compose ps

# 删除所有容器和网络（保留数据卷）
docker-compose down

# 删除所有容器、网络和数据卷
docker-compose down -v
```

## 服务器部署步骤

1. 在服务器上安装 Docker 和 Docker Compose

2. 将项目文件上传到服务器

3. 确保 `.env` 文件已正确配置

4. 运行以下命令启动服务：
   ```bash
   docker-compose up -d
   ```

5. 检查服务是否正常运行：
   ```bash
   docker-compose ps
   docker-compose logs
   ```

6. 访问 `http://服务器IP:3002` 测试 API

## 注意事项

- 数据库文件会自动持久化到 `server/database.sqlite`
- 如果需要修改端口，请同时修改 `docker-compose.yml` 和 `.env` 文件
- 容器会在崩溃后自动重启（`restart: unless-stopped`）
- 健康检查会在服务启动40秒后开始，每30秒检查一次

## 故障排查

### 服务无法启动

1. 检查端口是否被占用：
   ```bash
   netstat -tuln | grep 3002
   ```

2. 查看详细日志：
   ```bash
   docker-compose logs backend
   ```

### 数据库文件权限问题

确保 `server/database.sqlite` 文件有正确的读写权限：
```bash
chmod 666 server/database.sqlite
```

### 重新构建镜像

如果遇到问题，尝试重新构建：
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```
