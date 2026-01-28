# Docker 部署指南

## 架构说明

本项目使用 Docker Compose 部署前后端服务：

- **前端服务**: Vue3 + Nginx（端口 80）
- **后端服务**: Node.js + Express（端口 3002）
- **数据持久化**: SQLite 数据库 + 命名卷
- **自动初始化**: 首次启动自动创建数据库表和初始数据

访问架构：
```
用户 → Nginx (80端口)
       ├─→ 静态文件服务 (Vue3 应用 + public 资源)
       └─→ API 反向代理 (/api/*) → 后端服务 (3002端口)
```

## 🚀 快速开始（一键部署）

### 方法一：使用部署脚本（推荐）

**Linux/Mac:**
```bash
bash deploy.sh
```

**Windows:**
```bash
deploy.bat
```

### 方法二：手动部署

在项目根目录运行：

```bash
docker-compose up -d --build
```

这将会：
- ✅ 构建前端服务的 Docker 镜像（Vue3 + Nginx）
- ✅ 构建后端服务的 Docker 镜像（Node.js + Express）
- ✅ 自动创建数据库表结构
- ✅ 自动初始化卡片配置数据
- ✅ 启动前后端容器并在后台运行
- ✅ 配置持久化存储卷

**完成后即可直接访问，无需额外配置！**

## 📋 访问地址

部署完成后，可以通过以下地址访问：

- 🏠 **前端主页**: `http://你的域名` 或 `http://localhost`
- 🔧 **后端API**: `http://你的域名/api` 或 `http://localhost:3002`
- 👨‍💼 **管理后台**: `http://你的域名/admin` 或 `http://localhost/admin`
  - 密码: `zjy051104`

## 🛠️ 常用命令

### 查看服务状态

```bash
docker-compose ps
```

### 查看日志

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

### 停止服务

```bash
docker-compose down
```

### 重启服务

```bash
docker-compose restart
```

### 进入容器调试

```bash
# 进入后端容器
docker-compose exec backend sh

# 进入前端容器
docker-compose exec frontend sh
```

## ✨ 自动化特性

### 数据库自动初始化

后端服务首次启动时会自动：
1. ✅ 创建 SQLite 数据库文件
2. ✅ 创建 `comments` 表（评论系统）
3. ✅ 创建 `card_configs` 表（卡片配置）
4. ✅ 初始化 Tutorial 卡片数据（7个教程）
5. ✅ 初始化 Project 卡片数据（2个项目）

**数据持久化**: 数据库存储在 Docker 命名卷 `db-data` 中，容器删除后数据不会丢失。

### Public 资源自动部署

前端容器包含：
- ✅ Vue 应用构建产物
- ✅ Markdown 文章（`/articles`）
- ✅ 图片资源（`/picture`）
- ✅ 好友头像（`/friend_avatar`）

### Nginx 优化配置

- ✅ Gzip 压缩
- ✅ 静态资源缓存
- ✅ API 反向代理
- ✅ Vue Router history 模式支持
- ✅ 健康检查

## 📦 服务配置详情

### 前端服务

- **端口**: 80（HTTP）
- **技术栈**: Vue3 + Vite + Nginx
- **容器名**: `personal-pages-frontend`
- **静态文件位置**: `/usr/share/nginx/html`
- **包含内容**:
  - Vue 应用构建产物
  - Public 资源（articles、picture、friend_avatar）
- **Nginx 配置**: 
  - ✅ 支持 Vue Router history 模式
  - ✅ API 请求反向代理到后端 (`/api/*`)
  - ✅ Public 资源直接服务 (`/articles`, `/picture`, `/friend_avatar`)
  - ✅ 静态资源缓存优化（图片1年，文章1小时）
  - ✅ Gzip 压缩
- **健康检查**: 每30秒检查一次

### 后端服务

- **端口**: 3002
- **技术栈**: Node.js + Express + SQLite
- **容器名**: `personal-pages-backend`
- **数据持久化**: Docker 命名卷 `db-data` → `/app/data`
- **自动初始化**: 
  - ✅ 创建数据库表结构
  - ✅ 初始化卡片配置数据
- **API 端点**:
  - `/api/comments` - 评论系统
  - `/api/admin/*` - 管理后台 API
- **健康检查**: 每30秒检查一次

### 数据持久化

使用 Docker 命名卷确保数据安全：

```yaml
volumes:
  db-data:  # 存储 SQLite 数据库
```

**数据位置**: 
- 宿主机: Docker 管理的卷存储位置
- 容器内: `/app/data/database.sqlite`

**优点**:
- ✅ 容器删除后数据保留
- ✅ 易于备份和迁移
- ✅ 性能优化

### 环境变量配置

**前端环境变量** (`.env.production`):
```env
VITE_API_BASE_URL=http://quininezzzz.top/api
```

**后端环境变量** (`server/.env`):
```env
SERVER_PORT=3002
NODE_ENV=production
```

> 💡 **提示**: 在服务器部署时，记得修改 `VITE_API_BASE_URL` 为你的实际域名。

## 🚀 服务器部署步骤

### 1. 准备工作

确保服务器已安装 Docker 和 Docker Compose：

```bash
# 检查安装
docker --version
docker-compose --version

# 如未安装，参考官方文档安装
# https://docs.docker.com/engine/install/
```

### 2. 上传项目到服务器

```bash
# 方法一：使用 git
git clone https://github.com/你的用户名/Personal_Pages.git
cd Personal_Pages

# 方法二：使用 scp（从本地上传）
scp -r Personal_Pages/ user@server:/path/to/deploy/
```

### 3. 配置域名和环境变量

编辑 `.env.production` 文件：

```bash
nano .env.production
```

修改为你的域名：
```env
VITE_API_BASE_URL=http://你的域名/api
```

### 4. 一键部署

```bash
# Linux/Mac
bash deploy.sh

# 或手动执行
docker-compose up -d --build
```

### 5. 验证部署

```bash
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 测试访问
curl http://localhost
curl http://localhost/api
```

### 6. 配置防火墙（如需要）

```bash
# 开放 80 端口
sudo ufw allow 80/tcp

# 开放 443 端口（HTTPS）
sudo ufw allow 443/tcp
```

## 🔒 HTTPS 配置（可选）

如需启用 HTTPS，可以使用 Let's Encrypt 的 Certbot：

### 方法一：使用 Nginx Proxy Manager

推荐使用 Nginx Proxy Manager 来管理 SSL 证书。

### 方法二：手动配置 Certbot

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d 你的域名

# 自动续期
sudo certbot renew --dry-run
```

## 📊 监控和维护

### 查看实时日志

```bash
# 所有服务
docker-compose logs -f

# 仅后端
docker-compose logs -f backend

# 最近100行
docker-compose logs --tail=100
```

### 健康检查

```bash
# 查看容器健康状态
docker-compose ps

# 手动测试健康检查
curl http://localhost/
curl http://localhost:3002/
```

### 数据备份

**备份数据库**:
```bash
# 方法一：备份整个数据卷
docker run --rm -v personal_pages_db-data:/data -v $(pwd):/backup alpine tar czf /backup/db-backup.tar.gz /data

# 方法二：直接复制数据库文件
docker-compose exec backend cat /app/data/database.sqlite > backup.sqlite
```

**恢复数据库**:
```bash
# 停止服务
docker-compose down

# 删除旧数据卷
docker volume rm personal_pages_db-data

# 重新启动（会创建新卷）
docker-compose up -d

# 复制备份文件到容器
docker cp backup.sqlite personal-pages-backend:/app/data/database.sqlite

# 重启后端服务
docker-compose restart backend
```

### 更新应用

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并启动
docker-compose up -d --build

# 3. 查看日志确认
docker-compose logs -f
```

### 清理资源

```bash
# 清理未使用的镜像
docker image prune -a

# 清理未使用的容器
docker container prune

# 清理未使用的卷（注意：会删除数据！）
docker volume prune

# 清理所有未使用的资源
docker system prune -a
```

## 🐛 故障排查

### 问题1: 容器启动失败

```bash
# 查看详细日志
docker-compose logs backend
docker-compose logs frontend

# 检查容器状态
docker-compose ps

# 重启服务
docker-compose restart
```

### 问题2: 数据库无法初始化

```bash
# 进入后端容器
docker-compose exec backend sh

# 检查数据目录
ls -la /app/data/

# 检查权限
chmod 777 /app/data
```

### 问题3: 前端无法访问后端 API

```bash
# 检查后端服务是否运行
curl http://localhost:3002/

# 检查网络连接
docker network inspect personal_pages_personal-pages-network

# 测试容器间通信
docker-compose exec frontend ping backend
```

### 问题4: 端口被占用

```bash
# 查看端口占用
sudo lsof -i :80
sudo lsof -i :3002

# 修改 docker-compose.yml 中的端口映射
ports:
  - "8080:80"  # 将80改为8080
```

### 问题5: 构建失败

```bash
# 清理构建缓存
docker-compose build --no-cache

# 重新构建
docker-compose up -d --build --force-recreate
```

## 📝 重要提示

1. **首次部署**: 自动创建数据库和初始化数据，无需手动操作
2. **数据持久化**: 数据库存储在 Docker 卷中，删除容器不会丢失数据
3. **管理后台**: 访问 `/admin` 需要密码 `zjy051104`
4. **日志监控**: 建议定期查看日志，及时发现问题
5. **定期备份**: 建议每周备份一次数据库文件
6. **安全加固**: 生产环境建议修改管理员密码和启用 HTTPS

## 🔗 相关链接

- [Docker 官方文档](https://docs.docker.com/)
- [Docker Compose 文档](https://docs.docker.com/compose/)
- [Nginx 配置指南](https://nginx.org/en/docs/)
- [Let's Encrypt](https://letsencrypt.org/)

---

**最后更新**: 2026-01-29  
**版本**: 2.0.0 - 添加自动化部署支持
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
