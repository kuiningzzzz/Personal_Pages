# Personal Pages

我的个人主页，目前正在使用中。基于 Vue 3 + Express + SQLite 构建，通过 Docker 容器化部署。

如果你觉得还不错，可以 fork 下来作为模板使用。

在线地址：http://quininezzzz.top

## 启动方式

确保你的机器上安装了 Docker，然后在项目根目录执行：

```bash
docker compose up -d --build
```

启动后访问：
- 前端页面：http://localhost
- 管理后台：http://localhost/admin
- 后端 API：http://localhost:3002

## 技术栈

**前端**：Vue 3 + Vue Router + Vite + Marked + Highlight.js

**后端**：Node.js + Express + SQLite (better-sqlite3) + Multer

**部署**：Docker + Nginx 反向代理

## 项目结构

```
Personal_Pages/
│
├── src/                                # 前端源码
│   ├── main.js                         # Vue 应用入口
│   ├── App.vue                         # 根组件
│   ├── router/
│   │   └── index.js                    # 路由配置，定义各页面路径
│   ├── views/                          # 页面组件
│   │   ├── home.vue                    # 首页
│   │   ├── tutorial.vue                # 教程列表页
│   │   ├── project.vue                 # 项目列表页
│   │   ├── social.vue                  # 社交/友链页
│   │   ├── resource.vue                # 资源下载页
│   │   ├── markdown_viewer.vue         # Markdown 文章渲染页
│   │   ├── emoji_viewer.vue            # 表情包查看页
│   │   └── admin.vue                   # 管理后台入口
│   └── components/                     # 可复用组件
│       ├── header.vue                  # 页头导航
│       ├── footer.vue                  # 页脚
│       ├── markdown_reader.vue         # Markdown 渲染组件
│       ├── comment_area.vue            # 评论区组件
│       ├── tutorial_card.vue           # 教程卡片
│       ├── project_card.vue            # 项目卡片
│       ├── friend_card.vue             # 友链卡片
│       ├── emoji_card.vue              # 表情包卡片
│       ├── card_2to8.vue               # 通用卡片布局
│       ├── wordblock.vue               # 文字块组件
│       └── admin/                      # 管理后台子组件
│           ├── ArticleManager.vue      # 文章管理（增删改查 Markdown）
│           ├── ImageManager.vue        # 图片管理（上传/删除图片）
│           ├── CardConfigManager.vue   # 卡片配置管理（教程/项目/友链卡片）
│           ├── EmojiManager.vue        # 表情包管理
│           └── SourceManager.vue       # 资源文件管理
│
├── server/                             # 后端服务
│   ├── server.js                       # Express 服务入口，注册中间件和路由
│   ├── routes.js                       # 公开 API（文章内容、评论系统）
│   ├── admin-routes.js                 # 管理后台 API（文章/图片/卡片/资源管理）
│   ├── db.js                           # SQLite 数据库初始化和连接
│   ├── package.json                    # 后端依赖
│   ├── Dockerfile                      # 后端容器镜像
│   └── data/                           # SQLite 数据库文件存放目录
│
├── public/                             # 静态资源（会被直接托管）
│   ├── articles/                       # Markdown 文章
│   │   ├── tutorials/                  # 教程类文章
│   │   ├── projects/                   # 项目介绍文章
│   │   └── note/                       # 笔记
│   ├── picture/                        # 图片资源
│   ├── emoji/                          # 表情包资源
│   ├── friend_avatar/                  # 友链头像
│   └── source/                         # 可下载资源文件
│
├── docker-compose.yml                  # Docker Compose 编排配置
├── Dockerfile                          # 前端容器镜像
├── nginx.conf                          # Nginx 配置（静态托管 + API 反向代理）
├── vite.config.js                      # Vite 构建配置
└── package.json                        # 前端依赖
```

## 本地开发

如果不想用 Docker，也可以分别启动前后端：

**前端**
```bash
npm install
npm run dev
# 访问 http://localhost:5173
```

**后端**
```bash
cd server
npm install
npm start
# API 运行在 http://localhost:3002
```

开发时前端默认会请求 `http://localhost:3002` 的后端接口，需要在根目录创建 `.env.development`：
```
VITE_API_BASE_URL=http://localhost:3002
```

## 主要功能

- Markdown 文章展示，支持代码高亮
- 评论系统
- 管理后台：在线编辑文章、上传图片、配置卡片、管理表情包和资源文件
- 响应式布局，适配移动端

## 常用 Docker 命令

```bash
# 查看运行状态
docker compose ps

# 查看日志
docker compose logs -f

# 重启服务
docker compose restart

# 停止并移除容器
docker compose down

# 重新构建并启动
docker compose up -d --build
```

## 联系

- 网站：http://quininezzzz.top
- GitHub：[@kuiningzzzz](https://github.com/kuiningzzzz)
