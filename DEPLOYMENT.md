# 原生部署与日常维护

主站不再使用 Docker Compose。Vue 构建结果由系统 Nginx 提供；Express 由 systemd 以专用 `personalpages` 用户运行。只有广场活动后端继续使用该用户的 **rootless Docker**，不加入宿主机 rootful Docker 用户组，不给主站 sudo 权限。

## 当前服务器

- 项目：`/home/ubuntu/project/Personal_Pages`
- 前端发布目录：`/var/www/personal-pages`（只含构建产物）
- 后端：`127.0.0.1:3002`，服务名 `personal-pages`
- Node 24：`/opt/personal-pages-node/bin`
- Nginx 配置：`/etc/nginx/sites-available/personal-pages`，由 `sites-enabled` 链接启用
- HTTPS：使用已有 `/etc/nginx/ssl/quinine-personal/fullchain.pem` 与 `privkey.pem`
- 系统服务模板：`deploy/personal-pages.service`，安装时把 `PAGES_UID` 替换为 `id -u personalpages` 的结果
- 活动 Docker：用户服务 `docker.service`，套接字 `/run/user/<UID>/docker.sock`，数据在 `/var/lib/personal-pages/.local/share/docker`

主站代码由 `ubuntu` 维护；服务用户仅可写 `server/data`、`public` 和自己的家目录。Nginx 只服务前端发布目录，媒体目录逐个反代到后端，不对项目目录、私有数据或备份做静态映射。前端构建也不会把运行时上传文件再次复制进发布目录。不要把 `DATA_DIR` 设置到公开目录里。

云控制台的安全组/防火墙需要放行公网 TCP **80、443**；只开放 10050 不足以访问网站。主站后端 3002 和活动 40000 起的端口均仅绑定回环地址，无需对外开放。本机 `curl --resolve quininezzzz.top:443:127.0.0.1 https://quininezzzz.top/` 成功、但公网超时时，应检查云侧入站规则。

## 首次补充配置

编辑项目根目录 `.env`，不要在前端环境变量里放任何密钥：

```dotenv
ADMIN_PASSWORD=填写独立的长随机密码
SESSION_SECRET=填写固定的长随机值
SERVER_HOST=127.0.0.1
SERVER_PORT=3002
PUBLIC_SITE_URL=https://quininezzzz.top
QPA_VERIFY_URL=https://quininezzzz.top:10050/api/otp/verify
QPA_CLIENT_ID=personal-pages
QPA_PROJECT_TOKEN=填写独立的项目验证令牌
DEEPSEEK_API_KEY=填写原来的DeepSeek密钥
QQ_SMTP_USER=填写站主QQ邮箱
QQ_SMTP_AUTH_CODE=填写QQ邮箱SMTP授权码
```

`SESSION_SECRET` 若已由部署程序生成请保留。`QPA_PROJECT_TOKEN` 必须与 QuininePersonalAgent 配置中该客户端的令牌一致，不是手机实时六位密钥，也不是设备密钥或主密钥。可运行 `openssl rand -hex 32` 生成新的项目令牌。

编辑 `/home/ubuntu/project/QuininePersonalAgent/.env`，在已有 `QPA_VERIFY_CLIENTS` JSON 中合并该项，保留其他客户端：

```dotenv
QPA_VERIFY_CLIENTS={"personal-pages":"与主站QPA_PROJECT_TOKEN完全相同的令牌"}
```

然后执行：

```bash
sudo systemctl restart quinine-personal
sudo systemctl restart personal-pages
```

systemd 通过 `EnvironmentFile` 在启动时加载根目录 `.env`，不依赖服务用户直接读取该文件。建议由 `ubuntu` 持有，权限 `600`；原有 `640` 也可保留。编辑器原子保存造成所属组改变不会影响 systemd 加载。每次修改后需重启 `personal-pages`。管理员密码未填时禁止登录；OTP 未配置、网络故障、证书异常或验证接口非正常响应时均拒绝登录，不降级成仅验证密码。每次登录输入管理员密码以及手机上当前的六位实时密钥。

## 登录限制与服务器解锁

会话硬过期为登录后 3 天，不因操作而续期；刷新/重新进入后台时，已满 2 天的会话会失效。会话随机令牌仅以哈希落盘；Cookie 使用 HttpOnly、SameSite=Strict，生产 HTTPS 下使用 Secure。

单 IP 在滚动 7 天内第 3 次失败即封禁 7 天；所有 IP 在滚动 24 小时内第 11 次失败即锁定全部管理接口 24 小时。OTP 服务故障不算密码错误。Nginx 覆盖转发 IP，后端只信任回环代理，且不监听公网端口。

限制和管理员会话保存在 `server/data/admin-security.sqlite`，重启不清除。它独立于业务备份，备份导入不会清除封禁、回滚会话，也不会导入旧服务器管理员登录态。服务器主人可以直接解锁：

```bash
cd /home/ubuntu/project/Personal_Pages
sudo -u personalpages /opt/personal-pages-node/bin/node server/admin-unlock.js --all
# 或只解除指定 IP 的失败记录与封禁（不解除全局锁定）：
sudo -u personalpages /opt/personal-pages-node/bin/node server/admin-unlock.js --ip 你的IP
```

## 启停、日志与更新

```bash
sudo systemctl status personal-pages --no-pager
sudo systemctl restart personal-pages
sudo systemctl stop personal-pages
sudo systemctl start personal-pages
sudo journalctl -u personal-pages -f
sudo journalctl -u personal-pages -n 100 --no-pager
```

前端是静态文件，没有需要重启的前端进程。更新前端须重新构建并发布；修改 Nginx 配置后才需检查并重新加载 Nginx：

```bash
sudo nginx -t && sudo systemctl reload nginx
```

日常更新（以 ubuntu 用户执行）：

```bash
cd /home/ubuntu/project/Personal_Pages
export PATH=/opt/personal-pages-node/bin:$PATH
export NPM_CONFIG_REGISTRY=https://registry.npmjs.org
git pull --ff-only
npm ci
npm ci --prefix server
npm run build
sudo bash deploy/publish.sh
sudo systemctl restart personal-pages
```

需要代理时，在当前终端配置 `HTTP_PROXY=http://127.0.0.1:7890` 与 `HTTPS_PROXY=http://127.0.0.1:7890` 后执行安装命令。更改服务文件时复制到 `/etc/systemd/system/personal-pages.service`，替换 UID，再执行 `sudo systemctl daemon-reload` 和重启。

管理活动 Docker（不要使用宿主机 rootful Docker）：

```bash
uid=$(id -u personalpages)
sudo -u personalpages env XDG_RUNTIME_DIR=/run/user/$uid DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$uid/bus systemctl --user status docker
sudo -u personalpages env XDG_RUNTIME_DIR=/run/user/$uid DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$uid/bus systemctl --user restart docker
sudo -u personalpages env DOCKER_HOST=unix:///run/user/$uid/docker.sock /var/lib/personal-pages/bin/docker ps -a
```

`loginctl enable-linger personalpages` 保证重启服务器后该用户服务也会启动。Ubuntu 自带 rootlesskit 的 AppArmor 配置保持不变；Docker 用户服务 PATH 优先 `/usr/bin` 使用该系统版本。兼容旧 rootlesskit 时配置 `DOCKERD_ROOTLESS_ROOTLESSKIT_DETACH_NETNS=false`，不关闭系统 AppArmor 或用户命名空间限制。

当前服务器的用户服务覆盖配置位于 `/var/lib/personal-pages/.config/systemd/user/docker.service.d/system-rootlesskit.conf`。为使用宿主机 `127.0.0.1:7890` 代理，配置了 `DOCKERD_ROOTLESS_ROOTLESSKIT_DISABLE_HOST_LOOPBACK=false`，以及 `HTTP_PROXY`、`HTTPS_PROXY` 为 `http://10.0.2.2:7890`。这些只设置活动 Docker 的网络出口，不给主站 root 权限；代理不再使用时可移除代理环境变量并重启用户 Docker 服务。

## 备份与迁移

先完成密钥验证配置，再登录后台上传历史备份。仍支持原来的覆盖导入和增量导入；业务数据库、上传文件、AI 工作区、活动代码/镜像和存档保留原有恢复流程。备份包仅通过受管理员鉴权保护的 `/api/admin/backups` 下载，不放进前端目录。

`server/data` 与 `public` 必须由 `personalpages` 可写。活动镜像进入 rootless Docker 后，以容器 root 运行的旧活动可继续写入其挂载目录；自行使用非 root 容器用户的活动须按 Docker UID 映射设置挂载目录权限。

代码维护用户 `ubuntu` 需要遍历和维护 `public` 中的 Git 静态文件；当前已通过 `setfacl -m u:ubuntu:rwx public` 单独授予该目录权限，无需对其他用户开放私有数据目录。

大规模备份支持 ZIP64，上传上限 16GB，解压上限 128GB，最多 50 万个文件。旧 v1/v2 备份无需转换；备份格式版本仍为 v2，新生成的大规模 ZIP64 包应使用当前版本以上的网站还原。Nginx 的 `/api/admin/backups/restore` 单独配置 17G 请求体限制，以容纳 16GB 文件和 multipart 开销；Node 上传总时限为 2 小时，Nginx 仍有 600 秒不活动超时。更改后端的同时须发布前端、更新系统 Nginx 并检查 reload。

解压、数据库准备、还原前自动备份和回滚均在私有数据目录完成。请为上传包、解压文件、旧站数据和自动备份预留空间；程序会在解压时检查可用空间，无法完成校验时不会替换旧站。已校验的普通文件通过重命名进入暂存区，避免额外复制一整套大型媒体。应用还原时，public 与 data 可能因 systemd 的 ReadWritePaths 隔离而成为不同挂载点；程序会对 EXDEV 自动使用复制兼容路径。旧文件先完整复制并发布回滚副本，再删除原件；跨挂载回滚保留副本至事务结束。跨挂载还原需要为复制过程预留额外磁盘空间。

可在空闲时使用独立临时目录运行大规模验收（会创建并删除约数 GB 测试数据，默认测试不会运行）：

```bash
sudo install -d -o personalpages -g personalpages -m 700 /var/lib/personal-pages/backup-tests
cd /home/ubuntu/project/Personal_Pages
sudo -u personalpages env TMPDIR=/var/lib/personal-pages/backup-tests BACKUP_LARGE_TEST=1 /opt/personal-pages-node/bin/node --max-old-space-size=384 --test server/test/backup-large.test.js
```

游客存档按最后修改时间清理：启动时及每 6 小时清除闲置超过 10 天的游客目录，保留已登录用户存档和活动后端数据；备份/恢复期间等待清理结束。

## 新机器部署要点

安装 Node 24、Nginx、中文字体与 rootless Docker 所需系统包；创建专用用户和其 subuid/subgid，启用 linger。保持项目代码对服务用户只读，仅授予数据目录写权限。按上述模板安装 systemd 与 Nginx 配置，补充 `.env` 后启动。其他服务器域名、项目路径、TLS 路径或 UID 不同时，须同步调整部署模板。项目不会在应用启动时修改系统 Nginx。
