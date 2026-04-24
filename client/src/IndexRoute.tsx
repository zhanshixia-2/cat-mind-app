import { useContext, useState } from "react";
import { AuthedContext } from "./appContext";
import { login } from "./api";
import { HomePage } from "./HomePage";

/**
 * `/` 首页：已登录 = 读猫；未登录 = 密码登录
 */
export function IndexRoute() {
  const { authed, onLoginSuccess } = useContext(AuthedContext);

  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    try {
      await login(password);
      onLoginSuccess();
      setPassword("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "登录失败");
    }
  }

  if (authed) {
    return <HomePage />;
  }

  return (
    <>
      <header className="login-brand">
        <span className="login-emoji" aria-hidden>
          🐱
        </span>
        <h1>猫猫内心戏</h1>
        <p className="login-sub">
          上传猫主子，听听它在想什么（需访问密码）
        </p>
      </header>
      <form className="card card--login" onSubmit={handleLogin}>
        <label className="label">
          访问密码
          <input
            type="password"
            className="input--login"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="向管理员索取"
            autoComplete="current-password"
          />
        </label>
        {loginError ? <p className="error">{loginError}</p> : null}
        <button type="submit" className="btn-login-primary">
          进入
        </button>
      </form>
      <p className="login-footer-hint">🐾 默认密码：meow123</p>
    </>
  );
}
