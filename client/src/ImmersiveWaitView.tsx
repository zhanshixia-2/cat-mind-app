import { useEffect, useMemo, useState } from "react";
import { WAIT_CAT_IMAGE_URLS } from "./waitCatImages";

const TIPS = [
  "猫咪无法尝到甜味，但能感知水流的细微变化",
  "猫的一天大约有 2/3 在打盹～",
  "慢工出细活，主子的话值得等。",
  "喵星人靠胡须感知空间宽窄。",
  "此刻可能在翻译「喵言喵语」…",
  "摇摇尾巴不一定是开心哦。",
];

const ROTATE_MS = 2000;
const PRELOAD_HEAD = 5;

type Props = {
  /** 用户所选图的本地预览 URL */
  previewUrl: string | null;
  onExit: () => void;
};

export function ImmersiveWaitView({ previewUrl, onExit }: Props) {
  const n = WAIT_CAT_IMAGE_URLS.length;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % n);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [n]);

  useEffect(() => {
    WAIT_CAT_IMAGE_URLS.slice(0, PRELOAD_HEAD).forEach((src) => {
      const im = new Image();
      im.src = src;
    });
  }, []);

  const tip = useMemo(() => TIPS[index % TIPS.length], [index]);

  const src = WAIT_CAT_IMAGE_URLS[index] ?? "";

  return (
    <div
      className="immersive-wait"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label="生成中"
    >
      <div className="immersive-wait__bg" aria-hidden>
        <img
          key={src}
          src={src}
          alt=""
          className="immersive-wait__bg-img"
          decoding="async"
          onError={() => {
            setIndex((i) => (i + 1) % n);
          }}
        />
      </div>

      <div className="immersive-wait__top">
        <button
          type="button"
          className="immersive-wait__exit"
          onClick={onExit}
        >
          退出
        </button>
        <div className="immersive-wait__pager" aria-hidden>
          {WAIT_CAT_IMAGE_URLS.map((_, i) => (
            <span
              key={i}
              className={
                i === index
                  ? "immersive-wait__dot immersive-wait__dot--active"
                  : "immersive-wait__dot"
              }
            />
          ))}
        </div>
        <span className="immersive-wait__top-spacer" aria-hidden />
      </div>

      <div className="immersive-wait__gradient" aria-hidden />

      {previewUrl ? (
        <div className="immersive-wait__thumb-wrap">
          <div className="immersive-wait__thumb">
            <img src={previewUrl} alt="你上传的猫图" />
          </div>
          <span className="immersive-wait__thumb-label">你的主子</span>
        </div>
      ) : null}

      <div className="immersive-wait__bottom">
        <p className="immersive-wait__title">🐱 喵言喵语翻译需要时间哦</p>
        <div className="immersive-wait__bounce" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <p className="immersive-wait__tip" aria-live="polite">
          💡 {tip}
        </p>
      </div>
    </div>
  );
}
