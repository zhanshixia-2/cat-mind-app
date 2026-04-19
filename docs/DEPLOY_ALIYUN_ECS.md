# 阿里云 ECS 部署清单（路线 A）

面向 **零基础**：先能登录服务器，再让网站能访问。某一步卡住时，记下界面或报错再排查。

---

## 一、部署前要准备的东西

1. **阿里云账号**（手机号注册）并完成 **实名认证**（国内购买 ECS 一般需要）。
2. **支付方式**（支付宝/银行卡等）。
3. **电脑能上网**；Mac / Windows 均可（后面用终端连服务器）。
4. 项目代码：建议放在 **GitHub / Gitee**（私有仓库也可），方便服务器 `git clone`。没有也可用压缩包上传。

---

## 二、第一阶段：购买一台 ECS

### 1. 登录阿里云控制台

打开 [阿里云](https://www.aliyun.com) → 登录 → 进入控制台。

### 2. 开通云服务器 ECS

- 产品搜索 **ECS** → **创建实例**（或购买）。
- **地域**：选离你和用户近的机房（例如华东）。
- **实例规格**：学习/小项目可选 **2 核 2 GB** 左右（具体套餐名以控制台为准）。
- **镜像**：建议 **Ubuntu 22.04 64 位**（资料多、命令好找）。
- **系统盘**：约 40 GB 即可。
- **网络**：分配 **公网 IP**（需能从你电脑访问）。
- **带宽**：按量或固定小带宽均可，先跑通再优化。
- **安全组**：放行 **22（SSH）**、**80（HTTP）**、**443（HTTPS）**。若创建时未勾选，之后在「安全组规则」里手动添加入方向规则。

### 3. 登录方式

- **自定义密码**（务必保存好）；或 **密钥对**（更安全，首次可先用密码）。

### 4. 下单并等待实例为「运行中」

记下 **公网 IP**（例如 `47.xxx.xxx.xxx`）。

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

**连不上时常见原因**：安全组未放行 **TCP 22**；密码错误；使用密钥但未指定密钥文件。请在 ECS 控制台检查 **安全组入方向规则**。

---

## 四、第三阶段：安装运行环境

SSH 登录成功后，在服务器上执行。

### 1. 更新软件源并安装基础软件

```bash
apt update && apt install -y git nginx
```

### 2. 安装 Node.js 20（LTS）

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
```

应看到 `v20.x`。

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

| 变量 | 说明 |
|------|------|
| `APP_PASSWORD` | 访问密码 |
| `JWT_SECRET` | 长随机字符串 |
| `DASHSCOPE_API_KEY` 或 `OPENAI_API_KEY` | 百炼 / OpenAI Key |
| `PORT` | 后端端口，如 `8787` |
| `NODE_ENV` | 生产环境填 `production` |
| `CLIENT_ORIGIN` | 浏览器访问前端的完整地址 |

**CLIENT_ORIGIN 说明**：

- 暂时只有 IP、未配域名：可先填 `http://你的公网IP`。
- 已有域名且使用 HTTPS：填 `https://你的域名`。

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
        proxy_buffering off;
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

若无法访问：检查安全组是否放行 **80**；在服务器上执行 `curl http://127.0.0.1` 是否正常。

---

## 八、第七阶段：域名与 HTTPS（建议正式环境）

1. 在域名服务商将域名 **A 记录** 指向服务器 **公网 IP**。
2. 将 Nginx 中 `server_name` 改为你的域名；`.env` 中 `CLIENT_ORIGIN=https://你的域名`。
3. 使用 **Certbot** 等工具申请 Let’s Encrypt 证书，配置 Nginx 监听 **443** 与 SSL（可搜索「Ubuntu certbot nginx」按官方步骤操作）。
4. 修改环境变量后重启后端：`pm2 restart cat-mind-server`。

---

## 九、本项目注意事项

- **`.env` 放在项目根目录**（与 `server` 内加载路径一致）。
- **流式接口**：Nginx 中已配置 `proxy_buffering off` 与较长 `proxy_read_timeout`，减轻 NDJSON 流被截断的问题。
- **更新代码后**：`git pull` → `npm run build` → `pm2 restart cat-mind-server`；若仅前端变更，可只构建 client 后强刷浏览器（`Ctrl+F5`）。

---

## 十、建议推进顺序

1. 先做到 **用公网 IP + HTTP 能打开页面并登录**。
2. 再配置 **域名 + HTTPS**。

---

## 十一、阿里云相关链接（以官网为准）

- [云服务器 ECS 文档](https://help.aliyun.com/product/25365.html)

文档随产品更新，购买与控制台界面以当前阿里云页面为准。
