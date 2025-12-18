# Personal Pages

基于 Vue3 的个人网站项目，包含文章展示、评论系统等功能。

## 📚 技术栈

### 前端
- **框架**: Vue 3
- **构建工具**: Vite
- **路由**: Vue Router
- **Markdown**: Marked.js + Highlight.js

### 后端
- **运行环境**: Node.js
- **框架**: Express
- **数据库**: SQLite
- **ORM**: better-sqlite3

### 部署
- **容器化**: Docker + Docker Compose
- **Web 服务器**: Nginx
- **反向代理**: Nginx

## 🚀 快速开始

### 本地开发

1. **安装依赖**
   ```bash
   npm install
   ```

2. **启动开发服务器**
   ```bash
   npm run dev
   ```

3. **访问应用**
   ```
   http://localhost:5173
   ```

### 后端开发

1. **进入后端目录**
   ```bash
   cd server
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **配置环境变量**
   ```bash
   cp .env.example .env
   ```

4. **启动后端服务**
   ```bash
   npm start
   ```

## 📦 生产部署

### 方式一：使用部署脚本（推荐）

在服务器上运行：

```bash
# 赋予执行权限
chmod +x deploy.sh

# 执行部署
./deploy.sh
```

### 方式二：手动部署

1. **确保环境**
   ```bash
   # 检查 Docker 和 Docker Compose
   docker --version
   docker-compose --version
   ```

2. **配置环境变量**
   
   前端（`.env.production`）：
   ```env
   VITE_API_BASE_URL=http://quininezzzz.top/api
   ```
   
   后端（`server/.env`）：
   ```env
   SERVER_PORT=3002
   ```

3. **构建并启动**
   ```bash
   docker-compose up -d --build
   ```

4. **查看状态**
   ```bash
   docker-compose ps
   docker-compose logs -f
   ```

## 🏗️ 项目结构

```
Personal_Pages/
├── public/                 # 静态资源
│   ├── articles/          # Markdown 文章
│   ├── friend_avatar/     # 友链头像
│   └── picture/           # 图片资源
├── src/                   # 前端源码
│   ├── components/        # Vue 组件
│   ├── router/           # 路由配置
│   ├── views/            # 页面视图
│   ├── App.vue           # 根组件
│   └── main.js           # 入口文件
├── server/               # 后端代码
│   ├── db.js            # 数据库配置
│   ├── routes.js        # API 路由
│   ├── server.js        # 服务器入口
│   └── Dockerfile       # 后端容器配置
├── Dockerfile            # 前端容器配置
├── nginx.conf           # Nginx 配置
├── docker-compose.yml   # Docker Compose 配置
├── deploy.sh            # 部署脚本
└── DOCKER_DEPLOY.md     # 详细部署文档
```

## 🌐 部署架构

```
用户请求
    ↓
Nginx 容器 (80端口)
    ├─→ 静态文件服务 (Vue3 应用)
    └─→ API 反向代理 (/api/*) → 后端容器 (3002端口)
                                      ↓
                                 SQLite 数据库
```

## 🔧 常用命令

### 开发环境

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

### Docker 命令

```bash
# 启动所有服务
docker-compose up -d

# 停止所有服务
docker-compose down

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 重新构建
docker-compose up -d --build

# 只重启前端
docker-compose restart frontend

# 只重启后端
docker-compose restart backend
```

## 📝 API 接口

### 获取评论
```
GET /api/comments?page_id={page_id}
```

### 发表评论
```
POST /api/comments
Body: {
  page_id: string,
  username: string,
  email?: string,
  content: string
}
```

### 删除评论
```
DELETE /api/comments/:id
```

## 🛠️ 配置说明

### 前端环境变量

- **开发环境** (`.env.development`):
  ```env
  VITE_API_BASE_URL=http://localhost:3002
  ```

- **生产环境** (`.env.production`):
  ```env
  VITE_API_BASE_URL=http://quininezzzz.top/api
  ```

### Nginx 配置

- 支持 Vue Router history 模式
- API 请求自动代理到后端
- 静态资源缓存优化
- Gzip 压缩

## 🔒 安全建议

1. **配置 HTTPS**
   - 使用 Let's Encrypt 获取免费 SSL 证书
   - 修改 nginx.conf 启用 SSL

2. **防火墙配置**
   ```bash
   # 开放必要端口
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```

3. **定期备份数据库**
   ```bash
   cp server/database.sqlite server/database.sqlite.backup
   ```

## 📖 详细文档

更多部署细节和故障排查，请参考 [DOCKER_DEPLOY.md](./DOCKER_DEPLOY.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 👨‍💻 作者

quininezzzz

## 🔗 相关链接

- 网站：http://quininezzzz.top
- GitHub：https://github.com/kuiningzzzz/Personal_Pages
