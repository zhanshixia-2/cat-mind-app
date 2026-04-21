import { useCallback, useEffect, useRef, useState } from "react";
import {
  analyzePhoto,
  authMe,
  fetchUsage,
  login,
  logout,
  type Usage,
} from "./api";
import { WaitCatCarousel } from "./WaitCatCarousel";
import "./App.css";

export function App() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void authMe().then((ok) => {
      setAuthed(ok);
      setChecking(false);
    });
  }, []);

  const refreshUsage = useCallback(async () => {
    try {
      const u = await fetchUsage();
      setUsage(u);
    } catch {
      setUsage(null);
    }
  }, []);

  useEffect(() => {
    if (authed) void refreshUsage();
  }, [authed, refreshUsage]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError(null);
    try {
      await login(password);
      setAuthed(true);
      setPassword("");
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "登录失败");
    }
  }

  async function handleLogout() {
    await logout();
    setAuthed(false);
    setFile(null);
    setResult(null);
    setHint(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleTryAgain() {
    setFile(null);
    setResult(null);
    setHint(null);
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const resultWithPrefix =
    result !== null && result.length > 0
      ? `【咪想告诉你：】${result}`
      : null;

  async function handleShare() {
    if (!resultWithPrefix) return;
    const text = `猫猫内心戏\n${resultWithPrefix}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "猫猫内心戏", text });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setHint("已复制到剪贴板，可粘贴到微信等应用分享");
    } catch {
      setHint("复制失败，请长按文案手动复制");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!file) {
      setHint("请先选择一张猫图");
      return;
    }
    setLoading(true);
    setHint(null);
    setResult(null);
    try {
      const out = await analyzePhoto(file);
      setLoading(false);
      if (!out.ok) {
        setResult(null);
        setHint(`${out.message}（剩余 ${out.remaining} 张）`);
        void refreshUsage();
        return;
      }
      setResult(out.text);
      setHint(`今日剩余额度：${out.remaining} 张`);
      void refreshUsage();
    } catch (err) {
      setLoading(false);
      setHint(err instanceof Error ? err.message : "生成失败");
      void refreshUsage();
    }
  }

  if (checking) {
    return (
      <div className="page">
        <p className="muted">加载中…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="page">
        <header className="hero">
          <h1>猫猫内心戏</h1>
          <p className="muted">上传猫图，听听它在想什么（需访问密码）</p>
        </header>
        <form className="card" onSubmit={handleLogin}>
          <label className="label">
            访问密码
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="向管理员索取"
              autoComplete="current-password"
            />
          </label>
          {loginError ? <p className="error">{loginError}</p> : null}
          <button type="submit" className="btn primary">
            进入
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="page page--app">
      <div className="app-topbar">
        <button type="button" className="btn ghost app-logout" onClick={handleLogout}>
          退出
        </button>
      </div>

      <header className="hero hero--app">
        <h1>猫猫想说什么</h1>
      </header>

      <form className="card" onSubmit={handleSubmit}>
        <label className="label">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(e) => {
              const f = e.target.files?.[0];
              setFile(f ?? null);
              if (f) {
                setResult(null);
                setHint(null);
                setLoading(false);
              }
            }}
          />
        </label>
        {preview ? (
          <img src={preview} alt="预览" className="preview" />
        ) : null}
        <WaitCatCarousel active={loading} />
        {result === null && !loading ? (
          <button
            type="submit"
            className="btn primary"
            disabled={!file}
          >
            读取主子内心
          </button>
        ) : null}
        {result !== null ? (
          <>
            <blockquote className="result">
              <p>
                <span className="result-prefix">【咪想告诉你：】</span>
                {result}
              </p>
            </blockquote>
            <div className="result-actions">
              <button
                type="button"
                className="btn secondary"
                onClick={handleShare}
              >
                分享
              </button>
              <button
                type="button"
                className="btn outline"
                onClick={handleTryAgain}
              >
                再试一次
              </button>
            </div>
          </>
        ) : null}
      </form>
    </div>
  );
}
