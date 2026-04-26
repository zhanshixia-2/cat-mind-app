import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import {
  analyzePhoto,
  enterWithEmail,
  fetchUsage,
  persistReading,
  postPlazaPost,
} from "./api";
import { AuthedContext } from "./appContext";
import { CardWaitCarousel } from "./CardWaitCarousel";
import { compressImageFileIfLarge } from "./imageCompress";
import "./App.css";

type ResumeIntent = "save" | "publish";

function readCatUserError(unknown: unknown, fallback: string): string {
  if (!(unknown instanceof Error)) {
    return fallback;
  }
  const m = unknown.message;
  if (m.length > 120 && /<!DOCTYPE|<html|nginx|Request Entity/si.test(m)) {
    return "网络或网关异常（常由图片或上传体积引发）。可换小图、检查网络，或让管理员在 Nginx/网关中调大允许上传的体积。";
  }
  if (m === "Failed to fetch") {
    return "网络未连接或无法访问服务，请检查网络后重试。";
  }
  if (m.length < 500) {
    return m;
  }
  return fallback;
}

export function ReadCatPage() {
  const { authed, onLoginSuccess } = useContext(AuthedContext);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [readingId, setReadingId] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharingPlaza, setSharingPlaza] = useState(false);
  const [plazaShared, setPlazaShared] = useState(false);
  const [sharePlazaDismissed, setSharePlazaDismissed] = useState(false);
  const [resumeIntent, setResumeIntent] = useState<ResumeIntent | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [pendingLoginAction, setPendingLoginAction] = useState<ResumeIntent | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareCaptureRef = useRef<HTMLDivElement>(null);

  const refreshUsage = useCallback(async () => {
    try {
      await fetchUsage();
    } catch {
      /* 额度仅服务端计数 */
    }
  }, []);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const openLoginModal = useCallback((pending: ResumeIntent) => {
    setPendingLoginAction(pending);
    setLoginError(null);
    setLoginOpen(true);
  }, []);

  useEffect(() => {
    if (!resumeIntent || result == null) {
      return;
    }
    if (resumeIntent === "publish" && readingId == null) {
      return;
    }
    const what = resumeIntent;
    setResumeIntent(null);
    const t = window.setTimeout(() => {
      if (what === "save") void handleSave();
      else void handleShareToPlaza();
    }, 200);
    return () => clearTimeout(t);
  }, [resumeIntent, result, readingId]);

  function resetPlazaShareState() {
    setPlazaShared(false);
    setSharePlazaDismissed(false);
  }

  async function handleSave() {
    if (!authed) {
      openLoginModal("save");
      return;
    }
    const el = shareCaptureRef.current;
    if (!el || !result || saving) return;
    setSaving(true);
    setHint(null);
    try {
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
      const outFile = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [outFile] })) {
        try {
          await navigator.share({
            files: [outFile],
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
        readCatUserError(err, "保存图片时出错，请稍后再试。"),
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

  async function handleShareToPlaza() {
    if (!authed) {
      openLoginModal("publish");
      return;
    }
    const el = shareCaptureRef.current;
    if (!el || !result || sharingPlaza) {
      return;
    }
    setSharingPlaza(true);
    setHint(null);
    try {
      let readyFile = file;
      let rid = readingId;
      if (rid == null) {
        if (!readyFile || !result) {
          setHint("无法关联读猫记录，请重新生成一次");
          return;
        }
        // 方案 C：发布前补 readingId 时不再 setFile，避免移动端预览图重渲染导致截图空白
        readyFile = await compressImageFileIfLarge(readyFile);
        const persisted = await persistReading(readyFile, result);
        rid = persisted.readingId;
        setReadingId(rid);
      }
      const blob = await toBlob(el, {
        cacheBust: false,
        backgroundColor: "#ffffff",
        pixelRatio: Math.min(2, typeof window !== "undefined" ? window.devicePixelRatio || 2 : 2),
      });
      if (!blob) {
        setHint("生成图片失败，请重试");
        return;
      }
      const f = new File([blob], "plaza-tile.png", { type: "image/png" });
      const text = `【咪想告诉你：】${result}`;
      await postPlazaPost(f, text, rid);
      setPlazaShared(true);
      setHint("已同步到「广场」，其他主子也能看到啦～");
    } catch (e) {
      setHint(
        readCatUserError(
          e,
          "发布到广场失败，请稍后再试。",
        ),
      );
    } finally {
      setSharingPlaza(false);
    }
  }

  function handleReselect() {
    setFile(null);
    setResult(null);
    setReadingId(null);
    setHint(null);
    setLoading(false);
    resetPlazaShareState();
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleTryAgain() {
    handleReselect();
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
    setReadingId(null);
    resetPlazaShareState();
    try {
      const ready = await compressImageFileIfLarge(file);
      setFile(ready);
      const out = await analyzePhoto(ready);
      setLoading(false);
      if (!out.ok) {
        setResult(null);
        setHint(`${out.message}（剩余 ${out.remaining} 张）`);
        void refreshUsage();
        return;
      }
      setResult(out.text);
      setReadingId(out.readingId);
      // setHint(`今日剩余额度：${out.remaining} 张`);
      void refreshUsage();
    } catch (err) {
      setLoading(false);
      setHint(readCatUserError(err, "生成失败，请重试。"));
      void refreshUsage();
    }
  }

  const showPlazaPrompt =
    result !== null && !loading && !plazaShared && !sharePlazaDismissed;

  async function onInlineLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loginLoading) return;
    setLoginLoading(true);
    setLoginError(null);
    try {
      const u = await enterWithEmail(loginEmail.trim(), loginPassword);
      onLoginSuccess(u);
      setLoginOpen(false);
      setLoginPassword("");
      const next = pendingLoginAction;
      setPendingLoginAction(null);
      if (next) {
        setResumeIntent(next);
      }
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <>
      <header className="hero-with-paws">
        <p className="paw-prints" aria-hidden>
          🐾 🐾
        </p>
        <h1>猫猫想说什么</h1>
      </header>

      <form className="card card--main" onSubmit={handleSubmit}>
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
                    setReadingId(null);
                    setHint(null);
                    setLoading(false);
                    resetPlazaShareState();
                  }
                }}
              />
              <div className="upload-placeholder">
                <span className="upload-icon" aria-hidden>
                  📷
                </span>
                <span className="upload-title">点击上传猫主子照片</span>
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
            {showPlazaPrompt ? (
              <button
                type="button"
                className="btn-share"
                onClick={handleShareToPlaza}
                disabled={sharingPlaza}
              >
                {sharingPlaza ? "发布中…" : "发布"}
              </button>
        ) : null}
            <button
              type="button"
              className="btn-retry"
              onClick={handleTryAgain}
            >
              换一张
            </button>
          </div>
        ) : null}

        {hint ? (
          <p className="hint-banner" role="status">
            {hint}
          </p>
        ) : null}
      </form>

      {loginOpen ? (
        <div className="inline-login-backdrop" role="dialog" aria-modal="true" aria-label="登录后继续">
          <div className="inline-login-card">
            <h2 className="inline-login-title">登录</h2>
            <p className="inline-login-sub">
            登录后可将猫主子的心里话保存或者和大家分享哦~
            </p>
            <form className="inline-login-form" onSubmit={onInlineLoginSubmit}>
              <label className="label">
                邮箱
                <input
                  type="email"
                  className="input--login"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
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
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  placeholder="至少 6 位"
                  autoComplete="current-password"
                  minLength={6}
                  required
                />
              </label>
              {loginError ? <p className="error">{loginError}</p> : null}
              <div className="inline-login-actions">
                <button
                  type="button"
                  className="btn-share"
                  onClick={() => {
                    setLoginOpen(false);
                    setPendingLoginAction(null);
                    setLoginError(null);
                  }}
                  disabled={loginLoading}
                >
                  取消
                </button>
                <button type="submit" className="btn-retry" disabled={loginLoading}>
                  {loginLoading ? "登录中…" : "登录"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
