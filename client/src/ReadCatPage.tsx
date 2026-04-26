import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toBlob } from "html-to-image";
import {
  analyzePhoto,
  fetchUsage,
  persistReading,
  postPlazaPost,
} from "./api";
import { AuthedContext } from "./appContext";
import { CardWaitCarousel } from "./CardWaitCarousel";
import { compressImageFileIfLarge } from "./imageCompress";
import "./App.css";

const READ_DRAFT_KEY = "cat_mind_read_draft_v1";
const READ_DRAFT_DB = "cat_mind_read_draft_db";
const READ_DRAFT_STORE = "drafts";
const READ_DRAFT_ID = "latest";

type ResumeIntent = "save" | "publish";

type ReadDraftV2 = {
  v: 2;
  name: string;
  mime: string;
  file: Blob;
  result: string;
  pending: ResumeIntent;
};

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(READ_DRAFT_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(READ_DRAFT_STORE)) {
        db.createObjectStore(READ_DRAFT_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("打开草稿存储失败"));
  });
}

async function saveDraftV2(draft: ReadDraftV2): Promise<void> {
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(READ_DRAFT_STORE, "readwrite");
    tx.objectStore(READ_DRAFT_STORE).put(draft, READ_DRAFT_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("保存草稿失败"));
    tx.onabort = () => reject(tx.error ?? new Error("保存草稿失败"));
  });
  db.close();
}

async function loadDraftV2(): Promise<ReadDraftV2 | null> {
  const db = await openDraftDb();
  const out = await new Promise<ReadDraftV2 | null>((resolve, reject) => {
    const tx = db.transaction(READ_DRAFT_STORE, "readonly");
    const req = tx.objectStore(READ_DRAFT_STORE).get(READ_DRAFT_ID);
    req.onsuccess = () => {
      const val = req.result as ReadDraftV2 | undefined;
      resolve(val ?? null);
    };
    req.onerror = () => reject(req.error ?? new Error("读取草稿失败"));
  });
  db.close();
  return out;
}

async function clearDraftV2(): Promise<void> {
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(READ_DRAFT_STORE, "readwrite");
    tx.objectStore(READ_DRAFT_STORE).delete(READ_DRAFT_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("清理草稿失败"));
    tx.onabort = () => reject(tx.error ?? new Error("清理草稿失败"));
  });
  db.close();
}

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

function base64ToFile(base64: string, mime: string): File {
  const bstr = atob(base64);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  const ext = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : mime.includes("gif")
        ? "gif"
        : "jpg";
  return new File([u8], `draft.${ext}`, { type: mime || "image/jpeg" });
}

export function ReadCatPage() {
  const { authed } = useContext(AuthedContext);
  const navigate = useNavigate();
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareCaptureRef = useRef<HTMLDivElement>(null);
  const saveLatestRef = useRef<() => Promise<void>>(
    () => Promise.resolve(),
  );
  const plazaLatestRef = useRef<() => Promise<void>>(
    () => Promise.resolve(),
  );

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

  const goLoginWithDraft = useCallback(
    (pending: ResumeIntent) => {
      if (!file || !result) return;
      void (async () => {
        let f = file;
        try {
          f = await compressImageFileIfLarge(file);
          setFile(f);
        } catch (e) {
          setHint(readCatUserError(e, "处理图片时出错，请重试或换小图。"));
          return;
        }
        try {
          await saveDraftV2({
            v: 2,
            name: f.name || "draft.jpg",
            mime: f.type || "image/jpeg",
            file: f,
            result,
            pending,
          });
        } catch {
          const fr = new FileReader();
          fr.onload = () => {
            const dataUrl = fr.result as string;
            const i = dataUrl.indexOf(",");
            const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
            const mime = f.type || "image/jpeg";
            try {
              sessionStorage.setItem(
                READ_DRAFT_KEY,
                JSON.stringify({
                  v: 1,
                  imageBase64: b64,
                  mime,
                  result,
                  pending,
                }),
              );
            } catch {
              setHint("图片或文案过大，无法暂存。请先登录后再读猫。");
              return;
            }
            void navigate("/login?redirect=" + encodeURIComponent("/read"));
          };
          fr.onerror = () => {
            setHint("无法读取图片，请重试或先登录。");
          };
          fr.readAsDataURL(f);
          return;
        }
        void navigate("/login?redirect=" + encodeURIComponent("/read"));
      })();
    },
    [file, result, navigate],
  );

  useEffect(() => {
    if (!authed) return;
    void (async () => {
      let restored: { file: File; result: string; pending: ResumeIntent } | null =
        null;
      try {
        const d2 = await loadDraftV2();
        if (d2 && d2.v === 2 && d2.result) {
          restored = {
            file: new File([d2.file], d2.name || "draft.jpg", {
              type: d2.mime || "image/jpeg",
            }),
            result: d2.result,
            pending: d2.pending,
          };
          await clearDraftV2();
        }
      } catch {
        /* ignore indexedDB and fallback */
      }
      if (!restored) {
        const raw = sessionStorage.getItem(READ_DRAFT_KEY);
        if (!raw) return;
        type DraftV1 = {
          v: number;
          imageBase64: string;
          mime: string;
          result: string;
          pending: ResumeIntent;
        };
        let d: DraftV1;
        try {
          d = JSON.parse(raw) as DraftV1;
        } catch {
          return;
        }
        if (d.v !== 1 || !d.imageBase64 || !d.result) {
          return;
        }
        sessionStorage.removeItem(READ_DRAFT_KEY);
        restored = {
          file: base64ToFile(d.imageBase64, d.mime),
          result: d.result,
          pending: d.pending,
        };
      }
      let f = restored.file;
      setFile(f);
      setResult(restored.result);
      setLoading(false);
      setHint("正在恢复并保存你的读猫草稿…");
      try {
        f = await compressImageFileIfLarge(f);
        setFile(f);
        const { readingId: rid } = await persistReading(f, restored.result);
        setReadingId(rid);
        setHint(null);
        setPlazaShared(false);
        setSharePlazaDismissed(false);
        setResumeIntent(restored.pending);
      } catch (e) {
        setHint(readCatUserError(e, "保存读猫记录时出错，请重试。"));
      }
    })();
  }, [authed]);

  useEffect(() => {
    if (!resumeIntent || result == null || readingId == null) {
      return;
    }
    const what = resumeIntent;
    setResumeIntent(null);
    const t = window.setTimeout(() => {
      if (what === "save") void saveLatestRef.current();
      else void plazaLatestRef.current();
    }, 200);
    return () => clearTimeout(t);
  }, [resumeIntent, result, readingId]);

  function resetPlazaShareState() {
    setPlazaShared(false);
    setSharePlazaDismissed(false);
  }

  async function handleSave() {
    if (!authed) {
      goLoginWithDraft("save");
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
      goLoginWithDraft("publish");
      return;
    }
    const el = shareCaptureRef.current;
    if (!el || !result || sharingPlaza) {
      return;
    }
    if (readingId == null) {
      setHint("无法关联读猫记录，请重新生成一次");
      return;
    }
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
      await postPlazaPost(f, text, readingId);
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

  saveLatestRef.current = () => handleSave();
  plazaLatestRef.current = () => handleShareToPlaza();

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
    </>
  );
}
