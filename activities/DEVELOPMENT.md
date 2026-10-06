# 广场活动开发与发布

每个活动是独立网页工程，可以附带独立后端；也可以直接嵌入外部网站。上传活动只更新运行时数据，不需要重建主站前端。主站保留导航、背景、页脚和全局音乐播放器。

## 1. 工作区与配置

```text
activities/
  DEVELOPMENT.md           本文
  release.js               自动产包脚本
  dev/
    README.md
    wordle/
      config.json
      frontend/            原生网页，或 Vue 项目
      backend/             后端工程，无后端时可为空
  release/
    README.md
    wordle-<时间>-<版本>.zip
```

`dev` 中实际工程和 `release` 中产物均被 gitignore；两个 README、脚本和本文保留在 Git 中。项目资料请自行备份，服务器上传后的代码包和活动存档会进入主站备份。

`dev/wordle/config.json`：

```json
{
  "id": "wordle",
  "frontend": "static",
  "backend": false
}
```

- `id` 与工程文件夹名一致：以小写字母开头，只含小写字母、数字、连字符，最长 63 字符。
  `imports`、`external-数字` 和 Windows 设备名为保留名称。
- `frontend`：`static` 表示 HTML/CSS/JS；`vue` 表示通过 `npm run build` 构建的 Vue 工程。
- `backend`：布尔值，开启时必须有 `backend/Dockerfile`。
- 活动名称、简介、封面、标签、入口文案、限时安排和音乐策略由后台管理，未写死在包里。

## 2. 前端开发

### 原生网页

入口为 `frontend/index.html`，样式、脚本和图片放在该目录的任意安全子目录。

```html
<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>小游戏</title></head>
<body>
  <h1 id="greeting"></h1>
  <script>
    window.addEventListener('DOMContentLoaded', async () => {
      const sdk = window.ActivitySDK;
      await sdk.ready;
      const result = await sdk.getUser();
      document.querySelector('#greeting').textContent = result.loggedIn
        ? `你好，${result.user.username}` : '欢迎游客';
      document.documentElement.dataset.theme = await sdk.getTheme();
      sdk.onThemeChange(theme => document.documentElement.dataset.theme = theme);
    });
  </script>
</body>
</html>
```

主站会在 HTML 中自动注入 SDK 和当前活动的运行配置，无需自行打包 SDK。

### Vue 项目

在 `frontend` 中正常安装依赖、开发。必须有 `package.json` 的 `build` 脚本，构建产物为 `frontend/dist/index.html`。Vite 需使用相对路径：

```js
export default defineConfig({
  plugins: [vue()],
  base: './'
})
```

使用 Vue Router 时优先 `createWebHashHistory()`，避免把活动内部路由交给主站服务器。图片、JS、CSS 使用相对路径，勿使用 `/assets/...` 或将主站路径写死。模块资源支持跨域读取；活动在不共享主站来源的 iframe 沙箱中运行，不能依赖主站 Cookie、`localStorage` 或注册 Service Worker，存档使用 SDK。

本地开发时可在浏览器中自行 mock `window.ActivitySDK`；真实用户、存档、动态端口和主题联动通过后台预览验证。不要将用于 mock 的脚本置于发布入口覆盖 SDK。

## 3. 后端固定接口

后端语言和框架不限，以 Dockerfile 为入口。内部必须监听 **0.0.0.0:3000**。主站提供：

| 环境变量 | 含义 |
| --- | --- |
| `PORT=3000` | 容器内部监听端口 |
| `HOST=0.0.0.0` | 监听地址 |
| `ACTIVITY_DATA_DIR=/activity-data` | 持久数据目录，多个版本共享 |

示例 `backend/Dockerfile`：

```dockerfile
FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

`package-lock.json` 随工程提供。无依赖时可省略安装依赖两行。`.env`、`.env.*`、`node_modules`、`.git` 不进入发布包。活动自己的密钥在后台“后端环境变量”填写 JSON 对象，例如 `{"BOT_TOKEN":"..."}`，仅传给该活动容器；主站 API Key、管理员密码和邮箱授权码不会自动传入。

保存持久文件到 `process.env.ACTIVITY_DATA_DIR`，不要保存到镜像内部。后台保留旧版镜像，可在“版本管理”选择旧版，先预览再发布完成回退；后端数据结构升级需由活动自行负责。

### 后端身份与网络

活动前端调用 `ActivitySDK.backend.fetch('/api/vote', options)`，主站代理到该版本容器。`getRuntime()` 返回 `backendPort` 和 `backendBaseUrl`，修改端口后会广播更新。优先使用 SDK，不要拼接 `localhost:40000`，也不要把端口写死。

代理会验证主站登录和活动访问凭证，然后覆盖两个身份头：

- `X-Activity-Id`：活动数据库 ID。
- `X-Activity-User`：**base64url 编码的 UTF-8 JSON**；游客是 `null`，用户是 `{id, username}`，不包含邮箱或主站会话。

Node 解析示例：

```js
const user = JSON.parse(Buffer.from(req.headers['x-activity-user'], 'base64url').toString('utf8'));
```

业务需要登录时，后端仍应检查 `user`，例如游客投票拒绝，小游戏可允许。活动后端映射端口绑定宿主机 `127.0.0.1`，不直接暴露到公网。自行开放端口会绕过主站代理身份校验，应由活动额外鉴权。

HTTP 路径经代理移除前缀，`/api/vote` 在后端仍收到 `/api/vote`。支持 JSON、表单、二进制以及 WebSocket；主站 JSON 请求上限 2MB，SDK 文件存储上传上限 10MB。HTTP 请求超时 30 秒。需要大文件或长任务时使用活动后端的任务 ID + 状态轮询，或 WebSocket 通信。

QQ 机器人、抽奖、报名、投票等均可在活动后端实现。容器默认最多 512MB 内存、1 CPU、256 个进程，不给予特权模式或主站数据挂载。

## 4. SDK v1

`window.ActivitySDK` 在嵌入网页中可用。它通过经过窗口来源检查的私有 MessageChannel 与主站交互。

| 方法 | 返回 / 行为 |
| --- | --- |
| `await sdk.ready` | 与主站连接完成 |
| `await sdk.getUser()` | `{loggedIn:false,user:null}` 或 `{loggedIn:true,user:{id,username,isOwner}}` |
| `await sdk.getRuntime()` | 活动标识、版本、实际后端端口、代理地址 |
| `await sdk.getTheme()` | `light` / `dark` |
| `sdk.onThemeChange(fn)` | 主题变化通知，返回取消监听函数 |
| `sdk.onRuntimeChange(fn)` | 端口等运行配置变化通知，返回取消监听函数 |
| `await sdk.requestLogin()` | 打开主站登录页，登录后返回活动 |
| `await sdk.storage.get(key)` | 读取 JSON 存档，无存档返回 null |
| `await sdk.storage.set(key, value)` | 保存可 JSON 序列化的数据 |
| `await sdk.storage.remove(key)` | 删除该存档 |
| `await sdk.storage.upload(file)` | 上传 File/Blob，返回 `{id,name,size}` |
| `await sdk.storage.readFile(id)` | 读取自己上传的文件，返回 Blob |
| `await sdk.storage.deleteFile(id)` | 删除文件 |
| `await sdk.backend.fetch(path, options)` | 返回标准 Response，支持 `.json()` / `.text()` / `.arrayBuffer()` |
| `await sdk.backend.openSocket(path, protocols?)` | 返回连接对象，支持 `send(data)`、`close()`、`onMessage(fn)`、`onClose(fn)`、`onError(fn)` |

```js
const sdk = window.ActivitySDK;
await sdk.ready;
await sdk.storage.set('progress', { level: 3 });
const response = await sdk.backend.fetch('/api/vote', {
  method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({ choice: 'A' })
});
const result = await response.json();

const connection = await sdk.backend.openSocket('/live');
connection.onMessage(data => console.log(data));
await connection.send('hello');
```

每个活动、每位用户的 SDK 存档分别隔离，登录用户跨设备可读自己的存档。游客使用当前浏览器保存的匿名 ID，不会自动转移到新注册账户；清理浏览器数据后匿名 ID 也会丢失。每位用户在每个活动中最多 20MB / 200 文件，单个 JSON 存档 512KB，单文件 10MB。后端 `/activity-data` 是活动共享数据，不同于 SDK 的每用户存档目录。

WebSocket 单个活动最多同时 8 个连接；单条 SDK 发送消息最多 1MB。活动退出、版本替换、下线或时段关闭时，连接会关闭。凭证约 12 小时有效，长时间打开时可重新进入活动。
`backend.fetch` 的单次响应最多 20MB，防止把大型下载完整缓冲进浏览器内存；游戏图片、音频等较大静态资源直接使用活动包中的相对 URL。

## 5. 自动产包

项目根目录执行：

```sh
npm --prefix server ci
node activities/release.js <活动标识符>
```

Vue 工程先安装该工程自身依赖，脚本自动执行 `npm run build`。静态工程直接复制前端；开启后端时一并打包 `backend`。输出 `activities/release/<id>-<时间>-<版本>.zip`。

包结构：

```text
activity.json           类型、标识、版本、入口、逐文件大小和 SHA-256
frontend/index.html
frontend/...
backend/Dockerfile      有后端时必需
backend/...
```

不能手动编辑压缩包后再上传；修改文件必须重新产包，后台会校验所有文件的清单、大小、哈希和路径。拒绝重复版本、路径越界、符号链接、敏感文件、结构不符的包，上传上限 2GB，解压上限 20GB / 60000 文件。

## 6. 后台发布、版本与开放时段

1. “活动发布”上传 ZIP，校验后进入待发布；同一 `id` 成为该活动的新版本。
2. 设置名称、位置、入口文案、活动类型及需要的可选字段。标签池可以增删改，活动可以属于根目录或嵌套活动合集。
3. 点击“保存并进入预览”。主站排队构建后端镜像、分配端口和启动容器，任务结束后打开预览。
4. 预览不受时段和登录要求限制，仍只能通过管理员签发的活动预览入口访问。
5. 调试完成“保存并发布”。公开中的旧版保留到新版准备完成；发布成功后停止旧版容器，保留版本代码包和镜像。
6. 已发布列表中选择根目录 / 某个合集，使用上移下移调整该层显示顺序。根目录活动和合集混排，每个合集分别排序。

限时活动在 `[开始,结束)` 开放，公开列表始终可见，未开放点击提示“不在开放时段，无法进入”。预览版本保持运行；公开版本在关闭时段保留镜像但停止容器，后台每 15 秒检查一次时间，接口在时段边界即刻拒绝进入。主站需保持运行以进行容器调度。

端口从 40000 向上分配，跳过系统占用及其他版本已保留端口。后台显示每个后端版本端口，修改前先检查，新端口冲突则拒绝保存；切换失败会尝试恢复旧端口。运行中的网页通过 SDK 获得更新；HTTP 检测端口改变会刷新配置，WebSocket 应在关闭后重新连接。

已发布活动可同时有一个新版预览，因此可能同时运行两个容器，分别使用不同端口，**共享活动后端数据**。不要在新版预览时破坏旧版仍在使用的数据。

“撤回至待发布”停止活动运行。删除未在使用中的单个版本会删除该版包、容器和镜像，保留共享存档；移除整个活动删除所有版本和共享数据。合集必须先移出/删除成员再删除。主站 v2 备份包含活动包、元数据、版本记录、后端持久数据、SDK 存档和已构建的 Docker 镜像。多个版本共用的镜像层只导出一次，恢复时先验证镜像名称和标签，再加载并按活动状态启动。尚未构建的版本保存代码，预览时再构建；旧 v1 包未保存镜像，需要从代码重建。

## 7. 外部网站

后台点击“外部网站”，设置完整 HTTP/HTTPS URL，再预览、发布即可。外部服务器不由主站构建、启停或删除，版本管理仅适用于网页包。

目标必须允许 iframe 嵌入；外部网站的 X-Frame-Options / frame-ancestors 禁止嵌入时主站不能绕过。HTTPS 主站请使用 HTTPS 外部网址。

需要主站 SDK 时，外部网页在业务脚本之前引入：

```html
<script>window.ActivityParentOrigin = 'https://quininezzzz.top';</script>
<script src="https://quininezzzz.top/api/plaza/sdk.js"></script>
```

主站仍使用 iframe 沙箱隔离，不共享主站 Cookie、来源和全局样式。外部活动自身如依赖第三方 Cookie / localStorage / Service Worker，需调整网页使用方式；外部网站无法配置主站托管后端端口。

## 8. 主站部署与挂载

### 直接部署主站（Windows / Linux）

启动 Docker，确保当前运行主站的账户能调用 Docker CLI。Windows 标准 Docker Desktop 路径会自动识别，其他安装位置设置根 `.env` 的 `DOCKER_BIN`。不设置 `ACTIVITIES_IN_DOCKER`，主站代理访问宿主机 `127.0.0.1:<分配端口>`。

### Docker Compose 部署主站（Linux 服务器）

项目 `docker-compose.yml` 已配置：

- 后端镜像含 Docker CLI；挂载宿主机 `/var/run/docker.sock`。
- 主站数据目录 `./server/data:/app/data`，活动存放 `/app/data/activities`。
- 主站后端和活动后端连接共享 `personal-pages-activities` 网络。
- `ACTIVITIES_IN_DOCKER=1`、`ACTIVITIES_DOCKER_NETWORK=personal-pages-activities`。

活动的宿主端口仍由 Docker 映射并显示在后台；主站容器代理实际访问活动容器名的 `3000` 端口，避免把容器中的 localhost 错当成宿主机。持久数据挂载路径从主站自身的 Docker Mounts 转换为真实宿主路径；分配端口时创建临时探测容器，由 Docker 实际尝试绑定宿主机端口，避免只检测主站容器内部。

自定义 `docker run` 部署时也要挂载 data 和 Docker socket、加入同名共享网络并设置这两个变量。该容器模式针对 Linux Docker 宿主机；Windows 开发建议直接运行主站 + Docker Desktop 的 Linux 活动容器。

Nginx 已提供活动包 2GB 上传、流式代理和 WebSocket 转发；Vite 开发代理也支持 WebSocket。

Docker socket 允许主站管理员运行自己上传的后端代码，拥有宿主机 Docker 的管理权限，因此活动发布仅供受信任站主使用，不开放给普通注册用户。活动容器只挂载自己的数据目录，释放操作按活动版本标签限定，不清理主站或其他服务的容器、镜像、缓存和基础镜像层。

### 数据实际布局

```text
server/data/activities/
  <活动标识>/
    versions/<版本UUID>/
      activity.json
      release.zip
      frontend/
      backend/
    storage/
      backend/                  后端共享目录
      users/user-<账号ID>/       登录用户 SDK 存档
      users/guest-<匿名UUID>/    游客 SDK 存档
  external-<数据库ID>/storage/users/...
```

备份过程中活动后端会暂时停止，避免打包时仍有数据写入；备份完成后恢复需要运行的活动。还原重新挂载活动数据、校验容器归属并重新构建需要的镜像。增量导入保留现有存档和内容，不覆盖冲突数据。

## 9. 开发验证

常规测试不需要 Docker，也不会启动容器：

```sh
node --test server/test/activities.test.js
```

另提供自愿启用的真实 Docker 集成检查。在 Docker 已启动且当前账户能使用 Docker CLI 时，PowerShell 执行：

```powershell
$env:ACTIVITIES_DOCKER_TEST = '1'
node --test server/test/activities-docker.test.js
Remove-Item Env:ACTIVITIES_DOCKER_TEST
```

测试使用独立临时目录和内存数据库，构建两个测试版本，验证预览、限时启停、健康检查、代理访问、端口切换、共享存档及清理；不会修改站点数据库。默认测试基础镜像为 `node:24-bookworm-slim`，可用 `ACTIVITIES_TEST_BASE_IMAGE` 指定已有的 Node 24 镜像。测试结束删除自身容器、版本镜像和临时文件，保留基础镜像及 Docker 构建缓存。

验证主站容器模式时，将项目只读挂载到测试容器，挂载独立测试目录和 Docker socket，设置 `ACTIVITIES_TEST_ROOT` 为该测试目录的容器路径，并设置第 8 节的共享网络和容器模式变量。测试使用同一个文件，实际检查宿主端口探测、挂载路径转换和容器网络访问。
