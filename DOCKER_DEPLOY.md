# Docker 部署指南

## 架构说明

本项目使用 Docker Compose 部署前后端服务：

- **前端服务**: Vue3 + Nginx（端口 80）
- **后端服务**: Node.js + Express（端口 3002）
- **网络**: 两个服务在同一 Docker 网络中通信

访问架构：
```
用户 → Nginx (80端口)
       ├─→ 静态文件服务 (Vue3 应用)
       └─→ API 反向代理 (/api/*) → 后端服务 (3002端口)
```

## 快速开始

### 1. 构建并启动服务

在项目根目录运行：

```bash
docker-compose up -d
```

这将会：
- 构建前端服务的 Docker 镜像（Vue3 + Nginx）
- 构建后端服务的 Docker 镜像（Node.js + Express）
- 启动前后端容器
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

# 查看前端服务日志
docker-compose logs frontend

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

### 前端服务

- **端口**: 80（HTTP）
- **技术栈**: Vue3 + Vite + Nginx
- **静态文件**: 构建后的文件位于容器内 `/usr/share/nginx/html`
- **Nginx 配置**: 
  - 支持 Vue Router history 模式
  - API 请求反向代理到后端
  - 静态资源缓存优化
  - Gzip 压缩
- **健康检查**: 每30秒检查一次服务状态

### 后端服务

- **端口**: 3002（可在 docker-compose.yml 中修改）
- **数据持久化**: 使用 Docker 命名卷存储数据库文件（`/app/data` 目录）
- **环境变量**: 通过 `.env` 文件配置
- **健康检查**: 每30秒检查一次服务状态

### 环境变量配置

前端环境变量（`.env.production`）：
```env
VITE_API_BASE_URL=http://quininezzzz.top/api
```

后端环境变量（`server/.env`）：
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

### 准备工作

1. 确保服务器已安装 Docker 和 Docker Compose
   ```bash
   docker --version
   docker-compose --version
   ```

2. 配置域名解析（如果使用域名）
   - 将域名 A 记录指向服务器 IP
   - 例如：`quininezzzz.top` → 服务器 IP

### 部署步骤

1. **上传项目文件到服务器**
   ```bash
   # 使用 git clone 或 scp 上传
   git clone <repository-url>
   cd Personal_Pages
   ```

2. **配置环境变量**
   
   前端配置（`.env.production`）：
   ```env
   VITE_API_BASE_URL=http://quininezzzz.top/api
   ```
   
   后端配置（`server/.env`）：
   ```env
   SERVER_PORT=3002
   ```

3. **构建并启动服务**
   ```bash
   # 首次部署或代码更新后
   docker-compose up -d --build
   
   # 后续重启（不需要重新构建）
   docker-compose up -d
   ```

4. **检查服务状态**
   ```bash
   # 查看容器状态
   docker-compose ps
   
   # 查看日志
   docker-compose logs -f
   ```

5. **访问测试**
   - 前端页面：`http://服务器IP` 或 `http://quininezzzz.top`
   - 后端 API：`http://服务器IP/api/comments`

### 防火墙配置

确保服务器防火墙开放以下端口：

```bash
# Ubuntu/Debian
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS（如果配置 SSL）

# CentOS/RHEL
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload
```

### HTTPS 配置（可选）

如果需要 HTTPS，可以使用 Certbot 和 Let's Encrypt：

1. 安装 Certbot
2. 获取 SSL 证书
3. 修改 nginx.conf 配置 SSL
4. 更新 docker-compose.yml 端口映射（添加 443 端口）

## 注意事项

- 数据库文件使用 Docker 命名卷持久化，存储在 `/app/data/database.sqlite`
- 如果需要修改端口，请同时修改 `docker-compose.yml` 和相关配置文件
- 容器会在崩溃后自动重启（`restart: unless-stopped`）
- 健康检查会在服务启动40秒后开始，每30秒检查一次
- 前端构建时会使用 `.env.production` 环境变量
- API 请求路径必须以 `/api/` 开头才会被代理到后端
- Nginx 支持 Vue Router 的 history 模式，所有路由都会返回 index.html

## 故障排查

### 1. 前端无法访问

检查：
- 容器是否正常运行：`docker-compose ps`
- 查看前端日志：`docker-compose logs frontend`
- 检查 80 端口是否被占用：`netstat -tuln | grep :80`
- 防火墙是否开放 80 端口

### 2. API 请求失败

检查：
- 后端容器是否正常运行：`docker-compose ps`
- 查看后端日志：`docker-compose logs backend`
- Nginx 反向代理配置是否正确
- 前端环境变量中的 API 地址是否正确

### 3. 页面刷新 404 错误

这通常是 Nginx 配置问题：
- 确认 `nginx.conf` 中有 `try_files $uri $uri/ /index.html;` 配置
- 重新构建前端镜像：`docker-compose up -d --build frontend`

### 4. 静态资源加载失败

检查：
- 构建过程是否成功：查看构建日志
- public 目录的文件是否正确复制

### 5. 数据库相关问题

数据库使用 Docker 命名卷存储，如需查看或备份：

```bash
# 查看命名卷
docker volume ls

# 进入容器查看数据库
docker-compose exec backend sh
ls -la /app/data/

# 备份数据库
docker-compose exec backend cat /app/data/database.sqlite > backup.sqlite
```

### 6. 完全重新构建

如果遇到问题，尝试完全重新构建：
```bash
# 停止并删除所有容器
docker-compose down

# 删除旧镜像（可选）
docker images | grep personal-pages
docker rmi <image-id>

# 重新构建（不使用缓存）
docker-compose build --no-cache

# 启动服务
docker-compose up -d
```

### 7. 查看实时日志

```bash
# 查看所有服务的实时日志
docker-compose logs -f

# 只查看前端日志
docker-compose logs -f frontend

# 只查看后端日志
docker-compose logs -f backend
```

## 更新部署

当代码更新后：

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并启动
docker-compose up -d --build

# 3. 查看服务状态
docker-compose ps

# 4. 查看日志确认更新成功
docker-compose logs -f
```

## 性能优化建议

1. **启用 Gzip 压缩**（已在 nginx.conf 中配置）
2. **静态资源缓存**（已配置 1 年缓存）
3. **配置 CDN**（可选）
4. **数据库定期备份**
   ```bash
   # 从容器中备份数据库
   docker-compose exec backend cat /app/data/database.sqlite > backup_$(date +%Y%m%d).sqlite
   
   # 或者直接备份 Docker 卷
   docker run --rm -v personal_pages_db-data:/data -v $(pwd):/backup alpine tar czf /backup/db-backup-$(date +%Y%m%d).tar.gz -C /data .
   ```

## 监控和维护

定期检查：
- 容器运行状态：`docker-compose ps`
- 磁盘空间：`df -h`
- Docker 占用：`docker system df`
- 清理未使用的镜像：`docker system prune -a`
