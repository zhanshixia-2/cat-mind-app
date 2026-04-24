import { useCallback, useEffect, useRef, useState } from "react";
import { toBlob } from "html-to-image";
import {
  analyzePhoto,
  fetchUsage,
  postPlazaPost,
} from "./api";
import { CardWaitCarousel } from "./CardWaitCarousel";
import "./App.css";

export function HomePage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [sharingPlaza, setSharingPlaza] = useState(false);
  const [plazaShared, setPlazaShared] = useState(false);
  const [sharePlazaDismissed, setSharePlazaDismissed] = useState(false);
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

  function resetPlazaShareState() {
    setPlazaShared(false);
    setSharePlazaDismissed(false);
  }

  async function handleSave() {
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

  async function handleShareToPlaza() {
    const el = shareCaptureRef.current;
    if (!el || !result || sharingPlaza) return;
    setSharingPlaza(true);
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
      const f = new File([blob], "plaza-tile.png", { type: "image/png" });
      const text = `【咪想告诉你：】${result}`;
      await postPlazaPost(f, text);
      setPlazaShared(true);
      setHint("已同步到「广场」，其他主子也能看到啦～");
    } catch (e) {
      setHint(
        e instanceof Error ? e.message : "发布到广场失败，请稍后再试"
      );
    } finally {
      setSharingPlaza(false);
    }
  }

  function handleReselect() {
    setFile(null);
    setResult(null);
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
    resetPlazaShareState();
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

  const showPlazaPrompt =
    result !== null && !loading && !plazaShared && !sharePlazaDismissed;

  return (
    <>
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
                    resetPlazaShareState();
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

        {showPlazaPrompt ? (
          <div className="plaza-prompt" role="region" aria-label="同步到广场">
            <p className="plaza-prompt__title">要不要让别的主子也听听这段「喵言喵语」？</p>
            <p className="plaza-prompt__sub">
              同意后会用与「保存」同一张长图，出现在「猫猫心里话广场」里；不含你的登录名。
            </p>
            <div className="plaza-prompt__actions">
              <button
                type="button"
                className="btn-plaza-ok"
                onClick={handleShareToPlaza}
                disabled={sharingPlaza}
              >
                {sharingPlaza ? "发布中…" : "好，去广场分享"}
              </button>
              <button
                type="button"
                className="btn-plaza-skip"
                onClick={() => {
                  setSharePlazaDismissed(true);
                }}
              >
                暂不分享
              </button>
            </div>
          </div>
        ) : null}

        {hint ? (
          <p className="hint-banner" role="status">
            {hint}
          </p>
        ) : null}
      </form>
    </>
  );
}
