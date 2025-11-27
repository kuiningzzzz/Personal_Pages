# Personal Pages 评论系统（SQLite 版本）

## 📦 项目结构

```
server/
├── server.js          # Express 主服务器
├── db.js              # SQLite 数据库连接
├── routes.js          # API 路由
├── database.sqlite    # SQLite 数据库文件（自动创建）
├── package.json       # 依赖配置
├── .env.example       # 环境变量示例
└── .gitignore
```

## 🚀 快速开始

### 1. 安装依赖

```bash
cd server
npm install
```

### 2. 配置环境变量（可选）

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件（可选，默认端口 3001）：

```env
SERVER_PORT=3001
```

### 3. 启动服务器（自动创建数据库）

```bash
npm start
```

服务器将自动：
- ✅ 创建 SQLite 数据库文件 `database.sqlite`
- ✅ 创建 comments 表
- ✅ 插入示例数据（如果表为空）
- ✅ 启动服务器在 `http://localhost:3001`

**优势**：
- 🎯 无需安装 MySQL
- 🎯 无需配置数据库密码
- 🎯 数据库文件自动创建
- 🎯 轻量级，适合开发和学习

## 📡 API 接口

### 获取所有评论
```
GET /api/comments
```

**响应示例：**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "username": "奎宁zzzz",
      "email": "admin@example.com",
      "content": "欢迎来到我的个人主页！",
      "created_at": "2025-11-28T12:00:00.000Z"
    }
  ]
}
```

### 发表评论
```
POST /api/comments
Content-Type: application/json
```

**请求体：**
```json
{
  "username": "访客",
  "email": "visitor@example.com",
  "content": "你好！"
}
```

**响应示例：**
```json
{
  "success": true,
  "data": { ... },
  "message": "评论发表成功"
}
```

### 删除评论
```
DELETE /api/comments/:id
```

**响应示例：**
```json
{
  "success": true,
  "message": "评论删除成功"
}
```

## 🎨 前端使用

在 Vue 页面中使用评论组件：

```vue
<script setup>
import CommentArea from '../components/comment_area.vue'
</script>

<template>
  <CommentArea />
</template>
```

## 🔧 开发模式

使用 Node.js 18+ 的 watch 模式：

```bash
npm run dev
```

## 📝 注意事项

1. 确保前后端端口不冲突（前端默认 5173，后端默认 3001）
2. 评论内容最大 500 字符
3. 用户名最大 50 字符
4. 邮箱最大 100 字符
5. 数据库文件 `database.sqlite` 会自动创建

## 🛠️ 技术栈

- **后端**：Express.js + SQLite
- **前端**：Vue 3 Composition API
- **样式**：Glassmorphism 磨砂玻璃风格

## 💾 数据库说明

- 使用 **SQLite**（better-sqlite3）
- 数据库文件：`database.sqlite`（自动创建在 server 目录）
- 无需安装额外的数据库服务器
- 数据持久化存储在本地文件中
