import { useCallback, useEffect, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import {
  analyzePhoto,
  authMe,
  fetchUsage,
  login,
  logout,
} from "./api";
import { CardWaitCarousel } from "./CardWaitCarousel";
import "./App.css";

export function App() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareCaptureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void authMe().then((ok) => {
      setAuthed(ok);
      setChecking(false);
    });
  }, []);

  const refreshUsage = useCallback(async () => {
    try {
      await fetchUsage();
    } catch {
      /* 额度仅服务端计数，前端可不展示 */
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
    setLoading(false);
    await logout();
    setAuthed(false);
    setFile(null);
    setResult(null);
    setHint(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleReselect() {
    setFile(null);
    setResult(null);
    setHint(null);
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleTryAgain() {
    handleReselect();
  }

  /** 将红框内「猫图 + 心里话」截为 PNG，优先走系统分享以便存入相册，否则本地下载 */
  async function handleSave() {
    const el = shareCaptureRef.current;
    if (!el || !result || saving) return;
    setSaving(true);
    setHint(null);
    try {
      // 选图预览是 blob: URL；html-to-image 的 cacheBust 会给 src 加 ? 时间戳，Chrome 下会破坏 blob 地址导致报错
      const blob = await toBlob(el, {
        cacheBust: false,
        backgroundColor: "#ffffff",
        pixelRatio: Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 2 : 2),
      });
      if (!blob) {
        setHint("生成图片失败，请重试");
        return;
      }
      const filename = `猫猫内心戏-${new Date().toISOString().slice(0, 10)}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: "猫猫内心戏",
            text: "保存到相册",
          });
          setHint("请在系统分享面板中选择「存储到相簿」或「保存到相册」。");
        } catch (err) {
          if (err instanceof Error && err.name === "AbortError") {
            return;
          }
          triggerDownload(blob, filename);
          setHint("已尝试下载。若未进入相册，请到「文件/下载」中打开并保存。");
        }
        return;
      }
      triggerDownload(blob, filename);
      setHint("已下载。可在相册或文件中找到图片；若需放入相册，请用系统图库打开后保存。");
    } catch (err) {
      setHint(
        err instanceof Error ? err.message : "保存图片失败，请稍后再试"
      );
    } finally {
      setSaving(false);
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!file) {
      setHint("请先上传您的猫主子");
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
      <div className="page page--checking">
        <p className="text-loading">加载中…</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="page page--login">
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
      </div>
    );
  }

  return (
    <div className="page page--app">
      <div className="app-topbar">
        <button
          type="button"
          className="btn-exit"
          onClick={handleLogout}
        >
          退出
        </button>
      </div>

      <header className="hero-with-paws">
        <p className="paw-prints" aria-hidden>
          🐾 🐾
        </p>
        <h1>猫猫想说什么</h1>
      </header>

      <form className="card card--main" onSubmit={handleSubmit}>
        <p className="section-label">选择猫主子</p>

        <div className="upload-zone-wrap">
          {loading ? (
            <CardWaitCarousel previewUrl={preview} />
          ) : !preview ? (
            <label className="upload-zone">
              <input
                ref={fileInputRef}
                className="hidden-input"
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
              <div className="upload-placeholder">
                <span className="upload-icon" aria-hidden>
                  📷
                </span>
                <span className="upload-title">点击选择图片</span>
                <span className="upload-formats">支持 JPG、PNG、WebP、GIF</span>
              </div>
            </label>
          ) : result !== null ? (
            <div
              ref={shareCaptureRef}
              className="result-capture-bounds"
            >
              <div className="upload-zone upload-zone--has-preview">
                <img
                  src={preview}
                  alt="已选择的猫图"
                  className="preview-in-zone"
                />
              </div>
              <div className="result-box">
                <p>
                  <span className="result-emoji" aria-hidden>
                    😺
                  </span>
                  <span className="result-prefix">咪想告诉你：</span>
                  {result}
                </p>
              </div>
            </div>
          ) : (
            <div className="upload-zone upload-zone--has-preview">
              <img
                src={preview}
                alt="已选择的猫图"
                className="preview-in-zone"
              />
              {!result && !loading ? (
                <button
                  type="button"
                  className="link-reselect"
                  onClick={handleReselect}
                >
                  重新选择
                </button>
              ) : null}
            </div>
          )}
        </div>

        {result === null && !loading ? (
          <button
            type="submit"
            className="btn-primary-full"
            disabled={!file}
          >
            读取主子内心
          </button>
        ) : null}

        {result !== null ? (
          <div className="result-actions">
            <button
              type="button"
              className="btn-share"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "保存中…" : "保存"}
            </button>
            <button
              type="button"
              className="btn-retry"
              onClick={handleTryAgain}
            >
              换一张试试
            </button>
          </div>
        ) : null}

        {hint ? (
          <p className="hint-banner" role="status">
            {hint}
          </p>
        ) : null}
      </form>
      <footer className="app-footer">
        🐱 每只猫都有一肚子话想说
      </footer>
    </div>
  );
}
