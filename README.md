# Personal Pages

个人主页，使用 Vue 3、Express、SQLite 和 Docker。页面包括 Index、Moments、Resource 和 Activities；内容在 `/admin` 管理。

## 部署

1. 复制 `.env.example` 为 `.env`，设置强密码 `ADMIN_PASSWORD` 和随机 `SESSION_SECRET`。这两个变量仅供服务端使用，不会写入前端构建产物。旧版的 `VITE_ADMIN_PASSWORD` 已不再使用。
2. 运行 `docker compose up -d --build`。
3. 访问 `http://localhost` 或已配置证书的站点，打开 `/admin` 登录。

数据库保存在 `server/data`，上传内容保存在 `public/picture` 和 `public/source`。上线前请备份这两个目录。首次启动会从旧首页配置导入头像、名称、描述和卡片；旧教程与项目卡片会分别导入动态和资源库，关联的 Markdown 文件会写入新正文。标注“施工中”的内容会导入为草稿。旧数据库表不会被删除。

## 本地开发

前端：在仓库根目录运行 `npm install`、`npm run dev`。Vite 将 `/api` 代理到 `http://localhost:3002`。

后端：使用 Node 22.13+ 或 Node 24+，在 `server` 目录运行 `npm install`，然后执行 `npm start`。服务会自动读取仓库根目录的 `.env`；其中可设置 `ADMIN_PASSWORD`、`SESSION_SECRET` 和 `SERVER_PORT`，端口默认是 3002。已在系统环境变量中设置的同名值优先。后端使用 Node 自带的 `node:sqlite`，无需安装原生数据库模块；原有 SQLite 数据文件可继续使用。

```powershell
npm start
```

## 内容管理

- **首页介绍**：上传头像，编辑名称、描述以及任意数量的 Markdown 卡片。卡片支持链接、代码块、加粗、斜体、删除线；下划线使用 `++文字++` 或 `<u>文字</u>`。
- **动态**：创建文章或无标题短帖，编辑摘要、正文、标签、发布时间和草稿状态。短帖正文直接显示在列表中。
- **资源库**：管理资源分类和帖子，为每条资源配置按钮文字及链接。文件上传后可插入正文，或生成 Download 按钮。
- **搜索**：标题、标签和正文同时匹配。搜索时默认按匹配程度排序，也可按发布时间排序；没有搜索词时始终最新优先。
- **活动**：预留“施工中”页面。
- **站点文案**：动态、资源库、活动页的说明文字和页脚备案号可在后台修改。

上传文件最大 200 MB。图片在 `/picture`，其他文件在 `/source`；HTML、SVG、JavaScript 等可执行网页文件禁止上传。

## 验证

根目录运行 `npm run build`，后端目录运行 `npm test`。
