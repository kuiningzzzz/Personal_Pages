# Personal Pages

我的个人网站项目，基于 Vue3 + Vite 开发。

在线地址：http://quininezzzz.top

## 项目简介

这是一个前后端分离的个人网站，主要用来展示技术文章、个人项目和友链等。前端使用 Vue3 ，后端是一个简单的 Node.js 服务，用来处理评论功能。

主要功能：
- 文章展示（支持 Markdown）
- 项目展示
- 评论系统
- 友链页面

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

## 本地开发

### 前端

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build
```

需要在根目录创建 `.env.development` 文件：
```env
VITE_API_BASE_URL=http://localhost:3002
```

### 后端

```bash
cd server
npm install
npm start
```

在 `server` 目录创建 `.env` 文件：
```env
SERVER_PORT=3002
```

然后访问 http://localhost:5173 就可以看到网站了。

## Docker 部署

服务器上用 Docker 部署最方便：

```bash
# 启动
docker-compose up -d --build

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止
docker-compose down
```

部署的时候记得改 `.env.production` 文件：
```env
VITE_API_BASE_URL=http://quininezzzz.top/api
```

详细的部署说明看 [DOCKER_DEPLOY.md](DOCKER_DEPLOY.md)。

## 架构说明

整体架构很简单：

```
用户请求 → Nginx (80端口)
           ├─ 静态文件（Vue 应用）
           └─ API 代理 (/api/*) → Express 后端 (3002端口) → SQLite
```

Nginx 负责：
- 提供前端静态文件
- 把 /api/* 的请求转发到后端
- 处理 Vue Router 的 history 模式

后端只做了一个评论系统，数据存在 SQLite 里。

## API 接口

### 获取评论
```
GET /api/comments?article_id=<文章ID>
```

### 提交评论
```
POST /api/comments
Content-Type: application/json

{
  "article_id": "文章ID",
  "nickname": "昵称",
  "email": "邮箱",
  "content": "评论内容"
}
```

## 添加内容

### 添加文章

直接在 `public/articles/` 对应目录下放 `.md` 文件就行，然后在页面组件里引用。

### 添加图片

放在 `public/picture/` 下，Markdown 里这样引用：
```markdown
![描述](/picture/your-image.png)
```

### 添加友链

编辑 `src/views/social.vue`，添加友链信息。

## 部署到服务器

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
