# Personal Pages

我的个人网站项目，基于 Vue3 + Vite 开发，支持 Docker 一键部署。

**在线地址**: http://quininezzzz.top

## ✨ 主要特性

- 📝 **文章展示** - 支持 Markdown 渲染和代码高亮
- 🎨 **项目展示** - 展示个人项目作品
- 💬 **评论系统** - 基于 SQLite 的评论功能
- 👨‍💼 **管理后台** - 在线管理文章、图片和卡片配置
- 🐳 **Docker 部署** - 一条命令完成部署，自动初始化
- 🔒 **密码保护** - 管理后台需要密码认证

## 🚀 快速部署

### 一键部署（推荐）

```bash
docker-compose up -d --build
```

或使用部署脚本：
```bash
# Linux/Mac
bash deploy.sh

# Windows  
deploy.bat
```

**就这么简单！** 部署完成后：
- ✅ 前端: http://localhost
- ✅ 后端: http://localhost:3002
- ✅ 管理后台: http://localhost/admin (密码: zjy051104)

### 详细文档

- 📘 [快速开始指南](QUICK_START.md)
- 📗 [完整部署文档](DOCKER_DEPLOY.md)
- 📙 [管理后台使用说明](ADMIN_README.md)

## 技术栈

### 前端
- Vue 3.5.22
- Vue Router 4.6.3
- Vite 7.1.11
- Marked（Markdown 解析）
- Highlight.js（代码高亮）

### 后端
- Node.js (>=20.19.0)
- Express
- SQLite（better-sqlite3）
- express-session

### 部署
- Docker + Docker Compose
- Nginx

## 项目结构

```
Personal_Pages/
├── public/                   # 静态资源
│   ├── articles/            # Markdown 文章
│   │   ├── tutorials/      # 教程
│   │   ├── projects/       # 项目
│   │   └── note/           # 笔记
│   ├── picture/            # 图片
│   └── #其他资源
├── src/
│   ├── components/         # 组件
│   ├── views/              # 页面
│   └── router/             # 路由
├── server/                  # 后端服务
│   ├── server.js
│   ├── routes.js
│   └── db.js
├── docker-compose.yml
├── Dockerfile
└── nginx.conf
```

## 📦 项目结构

```
Personal_Pages/
├── public/                   # 静态资源
│   ├── articles/            # Markdown 文章
│   │   ├── tutorials/      # 教程文章
│   │   ├── projects/       # 项目介绍
│   │   └── note/           # 笔记
│   ├── picture/            # 图片资源
│   └── friend_avatar/      # 好友头像
├── src/
│   ├── components/         # Vue 组件
│   │   └── admin/         # 管理后台组件
│   ├── views/              # 页面
│   │   ├── admin.vue      # 管理后台
│   │   └── ...
│   └── router/             # 路由配置
├── server/                  # 后端服务
│   ├── server.js           # 主服务文件
│   ├── routes.js           # API 路由
│   ├── admin-routes.js     # 管理 API
│   ├── db.js               # 数据库配置
│   ├── init-data.js        # 初始数据
│   └── data/               # SQLite 数据库
├── docker-compose.yml       # Docker Compose 配置
├── Dockerfile               # 前端镜像
├── server/Dockerfile        # 后端镜像
├── nginx.conf               # Nginx 配置
├── deploy.sh                # Linux/Mac 部署脚本
├── deploy.bat               # Windows 部署脚本
├── QUICK_START.md           # 快速开始指南
├── DOCKER_DEPLOY.md         # Docker 部署文档
└── ADMIN_README.md          # 管理后台文档
```

## 💻 本地开发

### 前端开发

```bash
# 安装依赖
npm install

# 创建环境变量文件
echo "VITE_API_BASE_URL=http://localhost:3002" > .env.development

# 启动开发服务器
npm run dev

# 访问 http://localhost:5173
```

### 后端开发

```bash
# 进入后端目录
cd server

# 安装依赖
npm install

# 创建环境变量文件
echo "SERVER_PORT=3002" > .env

# 启动服务
npm start

# 或使用开发模式（自动重启）
npm run dev
```

### 构建生产版本

```bash
# 构建前端
npm run build

# 预览构建产物
npm run preview
```

## 🏗️ 系统架构

```
用户请求 → Nginx (80端口)
           ├─ 静态文件（Vue 应用 + public 资源）
           └─ API 代理 (/api/*) → Express 后端 (3002端口)
                                    └─ SQLite 数据库
```

### 前端架构
- **框架**: Vue 3 + Composition API
- **路由**: Vue Router (History 模式)
- **构建**: Vite
- **Markdown**: Marked + Highlight.js

### 后端架构
- **框架**: Express
- **数据库**: SQLite (better-sqlite3)
- **功能模块**:
  - 评论系统 API
  - 管理后台 API（文章、图片、卡片配置）
  - 文件上传（multer）

### 部署架构
- **容器化**: Docker + Docker Compose
- **Web 服务器**: Nginx
- **反向代理**: API 请求代理到后端
- **数据持久化**: Docker 命名卷

## 🔌 API 接口

### 评论系统

```http
# 获取评论列表
GET /api/comments?page_id=<页面ID>

# 发表评论
POST /api/comments
Content-Type: application/json
{
  "page_id": "页面ID",
  "username": "用户名",
  "email": "邮箱（可选）",
  "content": "评论内容"
}

# 删除评论
DELETE /api/comments/:id
```

### 管理后台 API

```http
# 文章管理
GET    /api/admin/articles              # 获取文章列表
GET    /api/admin/articles/content      # 获取文章内容
POST   /api/admin/articles              # 创建文章
PUT    /api/admin/articles              # 更新文章
DELETE /api/admin/articles              # 删除文章

# 图片管理
GET    /api/admin/images                # 获取图片列表
POST   /api/admin/images                # 上传图片
DELETE /api/admin/images                # 删除图片

# 卡片配置
GET    /api/admin/cards/:type           # 获取卡片配置
PUT    /api/admin/cards/:type           # 更新卡片配置
```

## ✍️ 内容管理

### 方式一：使用管理后台（推荐）

访问 `http://你的域名/admin` 进入管理后台，可以：
- 在线创建和编辑 Markdown 文章
- 上传和管理图片
- 配置文章和项目卡片

### 方式二：手动添加

**添加文章**:
1. 在 `public/articles/tutorials/` 下创建 `.md` 文件
2. 在管理后台的"卡片配置"中添加对应卡片

**添加图片**:
1. 将图片放在 `public/picture/` 目录
2. 在 Markdown 中引用：`![描述](/picture/your-image.png)`

**添加友链**:
编辑 `src/views/social.vue` 文件

## 🌐 服务器部署

### 步骤 1: 准备服务器

```bash
# 安装 Docker
curl -fsSL https://get.docker.com | sh

# 启动 Docker
sudo systemctl start docker
sudo systemctl enable docker
```

### 步骤 2: 上传项目

```bash
# 方法一：Git Clone
git clone https://github.com/你的用户名/Personal_Pages.git
cd Personal_Pages

# 方法二：从本地上传
scp -r Personal_Pages/ user@server:/path/to/deploy/
```

### 步骤 3: 配置域名（可选）

编辑 `.env.production`:
```env
VITE_API_BASE_URL=http://你的域名/api
```

### 步骤 4: 一键部署

```bash
docker-compose up -d --build
```

**完成！** 访问 http://你的域名 即可。

详细说明请查看 [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md)

## 🔧 常用命令

```bash
# 查看服务状态
docker-compose ps

# 查看实时日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose down

# 更新应用
git pull && docker-compose up -d --build

# 备份数据库
docker-compose exec backend cat /app/data/database.sqlite > backup.sqlite

# 进入容器调试
docker-compose exec backend sh
docker-compose exec frontend sh
```

## 📊 功能特性

### ✅ 已实现
- [x] 响应式设计，支持移动端
- [x] Markdown 文章渲染
- [x] 代码高亮显示
- [x] 评论系统
- [x] 管理后台
- [x] 文章在线编辑
- [x] 图片上传管理
- [x] 卡片配置管理
- [x] Docker 一键部署
- [x] 数据库自动初始化
- [x] 健康检查
- [x] 数据持久化

### 🚧 计划中
- [ ] 富文本编辑器（Monaco Editor）
- [ ] 文章预览功能
- [ ] 图片自动压缩
- [ ] 文章搜索功能
- [ ] 访问统计
- [ ] HTTPS 支持
- [ ] CI/CD 自动部署

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 开源协议

本项目采用 MIT 协议，详见 [LICENSE](LICENSE) 文件。

## 📧 联系方式

- 网站: http://quininezzzz.top
- GitHub: [@你的用户名](https://github.com/你的用户名)
- Email: 你的邮箱

## 🙏 致谢

- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Vite](https://vitejs.dev/) - 下一代前端构建工具
- [Express](https://expressjs.com/) - Node.js Web 框架
- [Marked](https://marked.js.org/) - Markdown 解析器
- [Highlight.js](https://highlightjs.org/) - 代码高亮库
- [Docker](https://www.docker.com/) - 容器化平台

---

⭐ 如果这个项目对你有帮助，欢迎 Star！

1. 确保服务器装了 Docker 和 Docker Compose
2. 把代码 clone 到服务器
3. 改好环境变量（`.env.production` 和 `server/.env`）
4. 运行 `docker-compose up -d --build`
5. 开放防火墙 80 端口

## 常见问题

**前端访问不了**
- 看看容器是否在运行：`docker-compose ps`
- 查看日志：`docker-compose logs frontend`

**API 请求失败**
- 检查后端容器：`docker-compose logs backend`
- 确认环境变量配置对不对

**页面刷新 404**
- 检查 nginx.conf 里有没有配置 `try_files $uri $uri/ /index.html;`

## 联系我

- GitHub: [@kuiningzzzz](https://github.com/kuiningzzzz)
- 网站: http://quininezzzz.top

有问题可以提 Issue 或者在网站上留言。
