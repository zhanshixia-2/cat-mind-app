# 猫猫内心戏（Cat Mind）

React + Node 小应用：上传**猫图** → 多模态生成内心独白（当前默认跳过判猫；非流式一次返回 JSON，内心戏长度上限见 `config.maxInnerThoughtChars`）；固定文案库已停用，仅作备查注释保留在 `prompts.ts`。

本仓库为**独立项目**，可与其它业务仓库（例如 `lingowhale`）**并列存放**，无嵌套关系。示例路径：`/Users/macos/zsh/cat-mind-app`（换机器后请改为你本机目录）。

## 需要准备

- **Node.js ≥ 22.5**（内置 `node:sqlite`；见 `server/package.json` 的 `engines`）
- 多模态 API：可用 **OpenAI**，或使用 **阿里云百炼（DashScope）OpenAI 兼容模式**（见下）

## 快速开始

```bash
cd path/to/cat-mind-app            # 本机示例：/Users/macos/zsh/cat-mind-app
cp .env.example .env
# 编辑「项目根目录」的 .env：JWT_SECRET、百炼 Key 等（勿只放在 server/ 里）

npm install
npm run dev
```

- 前端：[http://localhost:5173](http://localhost:5173)（通过 Vite 代理访问 `/api`）
- 后端：[http://localhost:8787](http://localhost:8787)

在应用内**注册/登录邮箱账号**后，再使用「读猫话」上传图片。首页为**广场**（可不登录浏览）；读猫话与「我的猫猫」需登录。

## 环境变量

见 `.env.example`。

**百炼（DashScope）要点**：

- **API Key**：在阿里云 **百炼 / 模型服务** 控制台创建（形如 `sk-…`），**不要**使用 RAM 子账号的 AccessKey ID/Secret。填 `DASHSCOPE_API_KEY` 或 `OPENAI_API_KEY`（二选一）。`.env` 里**不要加引号**、不要多空格（已做 trim，但 Key 本身必须正确）。
- **Base URL**：`https://dashscope.aliyuncs.com/compatible-mode/v1`。若已配置 `DASHSCOPE_API_KEY`，程序会**自动**使用该地址；若只把百炼 Key 写在 `OPENAI_API_KEY` 里，请**务必**再设 `OPENAI_BASE_URL` 或 `USE_DASHSCOPE_COMPAT=true`。
- **模型名**：`OPENAI_VISION_MODEL` 须与**百炼控制台 → 模型广场**里名称**完全一致**。部分账号下 `qwen-vl-plus` 可能不可用，可试：`qwen3-vl-flash`（默认）、`qwen-vl-max-latest`、`qwen-vl-plus-latest`、`qwen3-vl-plus` 等。
- **401 Incorrect API key**：到控制台 **重新创建/复制** Key；确认开通的是「模型服务」侧 Key；若仍失败，换浏览器无痕窗口登录控制台核对项目与 Key 是否同一地域/主账号。

若第一次「猫判定」接口报错不支持 JSON 模式，可加 `CLASSIFY_JSON_FORMAT=false`。

生产环境请设置 `NODE_ENV=production`、`CLIENT_ORIGIN` 为前端实际访问地址，Cookie 默认启用 `secure`（仅 HTTPS 发送）。若暂时只用 **HTTP + 公网 IP**（未上 HTTPS），须在 `.env` 增加 `AUTH_COOKIE_SECURE=false`，否则登录后接口仍可能返回 401。

## 目录说明

- `skills/design.md`：项目内**设计 / 产品规范**；新增页面或功能前应在 Cursor 中让智能体**先读**本文件，详见 `.cursor/rules/product-design-skill.mdc`。
- `docs/DEPLOY_ALIYUN_LIGHT.md`：**阿里云轻量应用服务器** 从零部署步骤（Nginx + PM2 + 环境变量；ECS 部署方式相同，仅控制台「安全组 / 防火墙」入口不同）。
- `POST /api/cat/analyze`：`multipart/form-data` 字段 `photo`；响应为 JSON：`{ ok: true, text, remaining }` 或 `{ ok: false, code, message, remaining }`；额度满时 HTTP 429。
- `server/src/ai/pipeline.ts`：第一次多模态判猫（非流式）+ 第二次多模态内心戏（流式增量）
- `server/src/ai/prompts.ts`：提示词、内心戏人设随机；旧版固定文案库已注释
- `client/src`：`/` 为**广场**；`/read` 读猫话；`/me` 我的猫猫；`/login` 邮箱注册/登录（无邮箱验证）。读猫话成功会写入 `user_readings` 并**落盘本次上传的猫图**（`source_image_filename`，目录见下），「我的」配图优先用已发广场的合成图（`GET /api/my/plaza-files/:name`），否则用读猫原图（`GET /api/my/reading-files/:name`）；**升级前**的历史记录若无落盘图，「我的」仍可能只有文字卡。发广场须带 `userReadingId`。「我的」里可对已上广场条目**下架**（`POST /api/my/plaza/:id/takedown`）；公开 `GET /api/plaza/files/:name` 仅 `active`。鉴权为 **JWT Cookie**（`sub` = 用户 id）。图与库路径见上条说明；评论/点赞未实现。

## 额度

全站内存计数 **每日 50 张**（进入 AI 流程前占用；非猫或低置信度会退回额度）。

单机部署即可；多实例需改为 Redis 等共享存储。