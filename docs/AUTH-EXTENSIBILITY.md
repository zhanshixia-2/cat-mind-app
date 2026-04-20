# 登录扩展（预留）

当前 MVP 使用 **环境变量密码 + JWT HttpOnly Cookie**，无用户账号。

后续若接入真实登录，建议：

1. 保留 `POST /api/auth/login` 路径，改为校验 OAuth / 手机号 OTP 等。
2. 在 `server/src/middleware/authJwt.ts` 中统一解析身份，payload 增加 `userId`。
3. 前端增加路由守卫；额度可按 `userId` 维度限流（需 Redis）。
4. 本文件仅为说明，不修改运行时行为。