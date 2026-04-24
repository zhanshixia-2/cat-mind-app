# 阿里云轻量应用服务器部署清单（路线 A）

面向 **零基础**：先能登录服务器，再让网站能访问。某一步卡住时，记下界面或报错再排查。

轻量应用服务器与 ECS 类似，均为 Linux 云主机；本文按 **轻量控制台** 的用词编写（**防火墙** 对应 ECS 的「安全组」）。若你使用的是 ECS，放行 **22 / 80 / 443** 的规则名不同，步骤一致。

---

## 一、部署前要准备的东西

1. **阿里云账号**（手机号注册）并完成 **实名认证**（国内购买轻量一般需要）。
2. **支付方式**（支付宝/银行卡等）。
3. **电脑能上网**；Mac / Windows 均可（后面用终端连服务器）。
4. 项目代码：建议放在 **GitHub / Gitee**（私有仓库也可），方便服务器 `git clone`。没有也可用压缩包上传。

---

## 二、第一阶段：购买一台轻量应用服务器

### 1. 登录阿里云控制台

打开 [阿里云](https://www.aliyun.com) → 登录 → 进入控制台。

### 2. 开通轻量应用服务器

- 产品搜索 **轻量应用服务器**（或 **Simple Application Server**）→ **创建服务器** / **购买**。
- **地域**：选离你和用户近的机房（例如华东）。
- **套餐**：学习/小项目建议 **2 核 2 GB 内存** 及以上（本应用为 Node + Nginx + 多模态 API，内存过小容易卡顿）。
- **镜像**：选择 **应用镜像** 中的 **Ubuntu 22.04**（或 **系统镜像** → **Ubuntu 22.04 64 位**）。资料多、与下文命令一致即可。
- **系统盘**：套餐自带容量一般够用（约 40 GB 级别即可跑通）。
- **流量包 / 带宽**：轻量多为 **峰值带宽 + 每月流量包**，个人小站通常够用；访问量很大时再考虑升级套餐。

### 3. 配置防火墙（入站规则）

在轻量实例详情页找到 **防火墙**（部分界面在「安全」或「网络」下）：

- 添加入方向规则，放行：**22（SSH）**、**80（HTTP）**、**443（HTTPS）**。
- 协议均为 **TCP**；若创建向导里已勾选 Web 服务，仍建议核对上述端口齐全。

### 4. 登录方式

- **自定义密码**（务必保存好）；或 **密钥对**（更安全，首次可先用密码）。

### 5. 下单并等待实例为「运行中」

在实例详情中记下 **公网 IP**（例如 `47.xxx.xxx.xxx`）。

---

## 三、第二阶段：从本机连接服务器（SSH）

### Windows

使用 **PowerShell** 或 [Windows Terminal](https://github.com/microsoft/terminal)。

```bash
ssh root@你的公网IP
```

（若创建的不是 `root` 用户，将 `root` 换成你的用户名。）

### macOS

打开「终端」，执行同上命令。

首次连接会问 `yes/no`，输入 `yes`，再输入密码。

**连不上时常见原因**：防火墙未放行 **TCP 22**；密码错误；使用密钥但未指定密钥文件。请在轻量控制台该实例的 **防火墙** 中检查入站规则。

---

## 四、第三阶段：安装运行环境

SSH 登录成功后，在服务器上执行。

### 1. 更新软件源并安装基础软件

```bash
apt update && apt install -y git nginx
```

### 2. 安装 Node.js 22（LTS；本项目 `node:sqlite` 需 ≥ 22.5）

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node -v
npm -v
```

应看到 `v22.x`（**≥ 22.5** 方可使用内置 SQLite 广场与 `server/data/plaza.db`）。

### 3. 安装 PM2（进程守护，关闭 SSH 后后端仍运行）

```bash
npm install -g pm2
```

---

## 五、第四阶段：把项目放到服务器

### 方式 A：Git（推荐）

```bash
cd /var/www
git clone 你的仓库地址 cat-mind-app
cd cat-mind-app
```

私有仓库需配置 **HTTPS + Token** 或 **SSH 公钥**（见 Git 托管平台帮助）。

### 方式 B：本机打包上传

在本机将项目打包（不要包含 `node_modules`），用 **WinSCP / FileZilla** 上传到服务器 `/var/www/` 并解压。

---

## 六、第五阶段：环境变量与构建

### 1. 创建项目根目录 `.env`

```bash
cd /var/www/cat-mind-app
nano .env
```

参考仓库内 `.env.example`，至少包含（值改为自己的）：


| 变量                                     | 说明                                                                  |
| -------------------------------------- | ------------------------------------------------------------------- |
| `APP_PASSWORD`                         | 访问密码                                                                |
| `JWT_SECRET`                           | 长随机字符串                                                              |
| `DASHSCOPE_API_KEY` 或 `OPENAI_API_KEY` | 百炼 / OpenAI Key                                                     |
| `PORT`                                 | 后端端口，如 `8787`                                                       |
| `NODE_ENV`                             | 生产环境填 `production`                                                  |
| `CLIENT_ORIGIN`                        | 浏览器访问前端的完整地址                                                        |
| `AUTH_COOKIE_SECURE`                   | 仅用 **HTTP**（如 `http://公网IP`）时填 `false`，否则登录 Cookie 无法用于接口，会 **401** |


**CLIENT_ORIGIN 说明**：

- 暂时只有 IP、未配域名：可先填 `http://你的公网IP`。
- 已有域名且使用 HTTPS：填 `https://你的域名`。

**仅 HTTP 访问时**：`NODE_ENV=production` 下默认 Cookie 带 `Secure`，浏览器在 **http** 页面不会带上该 Cookie，`/api/cat/analyze` 会一直 401。请在 `.env` 增加一行 `AUTH_COOKIE_SECURE=false`，保存后执行 `pm2 restart cat-mind-server`，再**重新登录**一次。

保存：`Ctrl+O` 回车，`Ctrl+X` 退出。

### 2. 安装依赖并构建

```bash
cd /var/www/cat-mind-app
npm install
npm run build
```

（根目录 `package.json` 会依次构建 `client` 与 `server`。）

### 3. 使用 PM2 启动后端

```bash
cd /var/www/cat-mind-app
pm2 start npm --name cat-mind-server -- run start
pm2 save
pm2 startup
```

`pm2 startup` 会输出一条需执行的 `sudo` 命令，**按提示复制执行**，以便服务器重启后 PM2 自动恢复。

### 4. 本机自检

```bash
curl -s http://127.0.0.1:8787/api/health
```

应返回包含 `"ok": true` 的 JSON。

---

## 七、第六阶段：Nginx 托管前端并反代 `/api`

### 1. 新建站点配置

```bash
nano /etc/nginx/sites-available/cat-mind
```

写入（路径与 `server_name` 按实际情况修改；无域名时 `server_name` 可先写 `_`）：

```nginx
server {
    listen 80;
    server_name _;

    root /var/www/cat-mind-app/client/dist;
    index index.html;

    location /api {
        proxy_pass http://127.0.0.1:8787;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 2. 启用并重载 Nginx

```bash
ln -sf /etc/nginx/sites-available/cat-mind /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 3. 浏览器访问

使用 `http://你的公网IP` 打开页面测试登录与上传。

若无法访问：检查轻量 **防火墙** 是否放行 **80**；在服务器上执行 `curl http://127.0.0.1` 是否正常。

---

## 八、第七阶段：域名与 HTTPS（建议正式环境）

1. 在域名服务商将域名 **A 记录** 指向服务器 **公网 IP**。
2. 将 Nginx 中 `server_name` 改为你的域名；`.env` 中 `CLIENT_ORIGIN=https://你的域名`。
3. 使用 **Certbot** 等工具申请 Let’s Encrypt 证书，配置 Nginx 监听 **443** 与 SSL（可搜索「Ubuntu certbot nginx」按官方步骤操作）。
4. 修改环境变量后重启后端：`pm2 restart cat-mind-server`。

---

## 九、本项目注意事项

- `**.env` 放在项目根目录**（与 `server` 内加载路径一致）。
- `**/api/cat/analyze`**：非流式 JSON 响应；Nginx 中对 `/api` 的 `proxy_read_timeout` 仍可保留，避免模型较慢时网关超时。
- **更新代码后**：`git pull` → `npm run build` → `pm2 restart cat-mind-server`；若仅前端变更，可只构建 client 后强刷浏览器（`Ctrl+F5`）。

---

## 十、建议推进顺序

1. 先做到 **用公网 IP + HTTP 能打开页面并登录**。
2. 再配置 **域名 + HTTPS**。

---

## 十一、SQLite 文件放哪、启动时怎么建表（轻量上一句流程）

**一句话流程**：在服务器上把库文件**固定**在 **`server/data/plaza.db`**（与默认实现一致，见 `server/src/db/paths.ts`），在 **Node 第一次启动** 时**建表**；发版**不要删** `server/data/` 和 **`server/uploads/plaza/`**。需 **Node ≥ 22.5**（`node:sqlite`）。可用 `SQLITE_PATH`、`PLAZA_UPLOAD_DIR` 设**绝对路径**。

| 要做什么 | 建议做法 |
|----------|----------|
| **文件放哪** | 库 **`server/data/plaza.db`**；图 **`server/uploads/plaza/`**；或设 `SQLITE_PATH` / `PLAZA_UPLOAD_DIR` 为绝对路径。 |
| **谁创建文件** | 后端**启动**时建目录、打开/创建 SQLite 并执行建表（见 `server/src/db/index.ts`）。 |
| **怎么建表** | 在代码里准备一段 `CREATE TABLE IF NOT EXISTS ...` 字符串（或分文件 migration），在「数据库连接成功后」**只执行一次**；已有表时 `IF NOT EXISTS` 不会覆盖数据。 |
| **权限** | 跑 Node 的用户对 **`server/data`、 `server/uploads/plaza`** 有写权限；首次 `chown` / `chmod` 一次。 |
| **Nginx 关系** | **不要**暴露 `*.db`；图仅经 **`/api/plaza/files/…`** 由后端校验后输出。 |
| **备份** | 定期复制 **`plaza.db`** 与**上传目录**；发版前可 `cp` 到 `~/backup/`。 |

本仓库已 `.gitignore` **`server/data/`、 `server/uploads/`**；**勿提交**真数据与真图到 Git。

---

## 十二、阿里云相关链接（以官网为准）

- [轻量应用服务器文档](https://help.aliyun.com/product/58606.html)

文档随产品更新，购买与控制台界面以当前阿里云页面为准。