import { useContext, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AuthedContext } from "./appContext";
import { loginEmail, registerEmail } from "./api";
import "./App.css";

export function LoginPage() {
  const { onLoginSuccess, authed } = useContext(AuthedContext);
  const [search] = useSearchParams();
  const nav = useNavigate();
  const redirect = search.get("redirect") || "/read";

  const [mode, setMode] = useState<"login" | "register">("login");
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
      const u =
        mode === "register"
          ? await registerEmail(email, password)
          : await loginEmail(email, password);
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
        <h1>{mode === "register" ? "注册账号" : "登录"}</h1>
        <p className="login-sub">
          使用邮箱与密码{mode === "register" ? "注册" : "登录"}
          后即可使用读猫话、我的记录等功能（无需验证邮箱）
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
            autoComplete={mode === "register" ? "new-password" : "current-password"}
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
          {loading
            ? "请稍候…"
            : mode === "register"
              ? "注册"
              : "进入"}
        </button>
        <p className="login-toggle">
          {mode === "register" ? (
            <>
              已有账号？{" "}
              <button
                type="button"
                className="link-ghost"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
              >
                去登录
              </button>
            </>
          ) : (
            <>
              没有账号？{" "}
              <button
                type="button"
                className="link-ghost"
                onClick={() => {
                  setMode("register");
                  setError(null);
                }}
              >
                注册一个
              </button>
            </>
          )}
        </p>
      </form>
    </>
  );
}
