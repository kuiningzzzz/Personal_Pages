# Admin 管理系统使用说明

## 概述

已成功为你的个人主页网站添加了 Admin 管理后台，采用方案三（混合方案）实现：
- 文件类内容（Markdown、图片）通过文件系统管理
- 结构化数据（卡片配置）通过数据库管理
- 独立的认证系统保护管理界面

## 功能特性

### 1. 访问方式
- **URL**: `http://quininezzzz.top/admin`
- **密码**: `zjy051104`
- **特点**: 不会出现在页眉导航栏中，仅通过直接访问 URL 进入

### 2. 三大管理模块

#### 📝 文章管理
- **查看文章列表**: 显示所有分类下的 Markdown 文章（tutorials、projects、note）
- **新建文章**: 选择分类，输入文件名和内容
- **编辑文章**: 在线编辑 Markdown 内容，实时保存
- **删除文章**: 删除不需要的文章文件
- **文件信息**: 显示文件大小、修改时间等

#### 🖼️ 图片管理
- **分类管理**: 教程图片、好友头像、其他图片
- **批量上传**: 支持一次上传多张图片
- **图片预览**: 网格视图展示所有图片
- **路径复制**: 一键复制图片引用路径，方便在文章中使用
- **删除图片**: 删除不需要的图片资源

#### 🎴 卡片配置管理
- **Tutorial 卡片**: 管理教程页面的文章卡片
- **Project 卡片**: 管理项目页面的项目卡片
- **编辑卡片**: 修改标题、描述、日期、链接
- **新增卡片**: 添加新的文章或项目卡片
- **排序功能**: 通过上下箭头调整卡片显示顺序
- **删除卡片**: 移除不需要的卡片

## 技术架构

### 前端
- **路由**: `/admin` - 独立路由，不在导航栏显示
- **认证**: 基于 SessionStorage 的密码认证
- **组件结构**:
  - `src/views/admin.vue` - 主页面
  - `src/components/admin/ArticleManager.vue` - 文章管理组件
  - `src/components/admin/ImageManager.vue` - 图片管理组件
  - `src/components/admin/CardConfigManager.vue` - 卡片配置组件

### 后端
- **API 路由**: `/api/admin/*`
- **主要文件**: `server/admin-routes.js`
- **功能模块**:
  - 文章 CRUD API
  - 图片上传/删除 API（使用 multer）
  - 卡片配置 CRUD API

### 数据库
- **新增表**: `card_configs`
  - `id`: 主键
  - `type`: 卡片类型（tutorials/projects）
  - `data`: JSON 格式的卡片数据
  - `display_order`: 显示顺序
  - `created_at`: 创建时间
  - `updated_at`: 更新时间

## API 接口文档

### 文章管理
```
GET    /api/admin/articles           - 获取所有文章列表
GET    /api/admin/articles/content   - 获取文章内容 (?path=...)
POST   /api/admin/articles           - 创建新文章
PUT    /api/admin/articles           - 更新文章
DELETE /api/admin/articles           - 删除文章
```

### 图片管理
```
GET    /api/admin/images    - 获取所有图片列表
POST   /api/admin/images    - 上传图片（multipart/form-data）
DELETE /api/admin/images    - 删除图片
```

### 卡片配置
```
GET    /api/admin/cards/:type    - 获取指定类型的卡片配置
PUT    /api/admin/cards/:type    - 更新卡片配置
```

## 启动方法

### 1. 启动后端服务器
```bash
cd server
npm start
# 或使用开发模式（自动重启）
npm run dev
```

### 2. 启动前端开发服务器
```bash
npm run dev
```

### 3. 访问管理界面
在浏览器中打开：`http://localhost:5173/admin`
输入密码：`zjy051104`

## 使用流程示例

### 添加新教程的完整流程

1. **编写文章**
   - 进入 Admin → 文章管理
   - 点击"新建文章"
   - 选择分类：tutorials
   - 输入文件名：new-tutorial.md
   - 编写 Markdown 内容
   - 保存

2. **上传相关图片**
   - 切换到图片管理
   - 选择"教程图片"分类
   - 上传图片文件
   - 复制图片路径（如：/picture/tutorials/screenshot.png）

3. **添加卡片配置**
   - 切换到卡片配置
   - 选择"Tutorial 卡片"
   - 点击"添加卡片"
   - 填写信息：
     - 标题：新教程标题
     - 描述：简短描述
     - 日期：2026-01-28
     - 链接：/article?src=/articles/tutorials/new-tutorial.md
   - 保存

4. **验证**
   - 访问 `http://localhost:5173/tutorial`
   - 检查新卡片是否显示
   - 点击卡片查看文章内容

## 安全建议

1. **密码修改**: 
   - 修改位置：`src/views/admin.vue` 第 75 行
   - 建议使用更复杂的密码

2. **生产环境部署**:
   - 建议添加后端 JWT 认证
   - 使用 HTTPS
   - 设置 API 访问限制（IP 白名单等）

3. **备份策略**:
   - 定期备份 `server/data/database.sqlite`
   - 定期备份 `public/articles/` 和 `public/picture/`

## 未来扩展建议

1. **富文本编辑器**: 集成 Monaco Editor 或 SimpleMDE
2. **图片压缩**: 上传时自动压缩图片
3. **文章预览**: 实时 Markdown 预览
4. **版本控制**: 文章修改历史记录
5. **批量操作**: 批量删除、移动文章
6. **搜索功能**: 搜索文章和图片

## 故障排查

### 问题1: 无法访问 /admin 页面
- 检查路由配置是否正确
- 确认前端服务正在运行

### 问题2: API 请求失败
- 确认后端服务器正在运行（端口 3001）
- 检查 CORS 配置
- 查看浏览器控制台错误信息

### 问题3: 图片上传失败
- 检查 public/picture 目录权限
- 确认 multer 依赖已安装
- 检查文件大小限制

### 问题4: 卡片配置不生效
- 确认数据库表已创建
- 重启后端服务器
- 检查数据库文件是否存在

## 联系与支持

如有问题或需要进一步定制，请随时联系。

---

**创建时间**: 2026-01-28  
**版本**: 1.0.0
