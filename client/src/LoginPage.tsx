import { useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthedContext } from "./appContext";
import { enterWithEmail } from "./api";
import "./App.css";

export function LoginPage() {
  const { onLoginSuccess, authed } = useContext(AuthedContext);
  const [search] = useSearchParams();
  const nav = useNavigate();
  const redirect = search.get("redirect") || "/read";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authed) {
      void nav(redirect, { replace: true });
    }
  }, [authed, nav, redirect]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const u = await enterWithEmail(email, password);
      onLoginSuccess(u);
      void nav(redirect, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "失败");
    } finally {
      setLoading(false);
    }
  };

  if (authed) {
    return null;
  }

  return (
    <>
      <header className="login-brand">
        <span className="login-emoji" aria-hidden>
          🐱
        </span>
        <h1>登录</h1>
        <p className="login-sub">
          输入邮箱与密码即可；若该邮箱尚未注册，将自动创建账号并登录。读猫话、我的记录等需登录后使用（无需验证邮箱）
        </p>
      </header>
      <form className="card card--login" onSubmit={onSubmit}>
        <label className="label">
          邮箱
          <input
            type="email"
            className="input--login"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label className="label">
          密码
          <input
            type="password"
            className="input--login"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="至少 6 位"
            autoComplete="current-password"
            minLength={6}
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button
          type="submit"
          className="btn-login-primary"
          disabled={loading}
        >
          {loading ? "请稍候…" : "进入"}
        </button>
      </form>
    </>
  );
}
