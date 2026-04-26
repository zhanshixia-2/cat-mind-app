import { useEffect, useState } from "react";
import { WAIT_CAT_IMAGE_URLS } from "./waitCatImages";

const ROTATE_MS = 4000;
const PRELOAD_HEAD = 5;

type Props = {
  /** 用户已选图的本地预览 URL */
  previewUrl: string | null;
};

/**
 * 主卡片内「生成中」轮播：无外框容器，与主卡内容区一体
 */
export function CardWaitCarousel({ previewUrl }: Props) {
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

  const src = WAIT_CAT_IMAGE_URLS[index] ?? "";

  return (
    <div
      className="card-wait-stack"
      role="status"
      aria-busy="true"
      aria-label="正在生成，猫图轮播中"
    >
      <div className="card-wait__carousel">
        <img
          key={src}
          src={src}
          alt=""
          className="card-wait__img"
          decoding="async"
          onError={() => {
            setIndex((i) => (i + 1) % n);
          }}
        />
      </div>

      {previewUrl ? (
        <div className="card-wait__user-row">
          <div className="card-wait__thumb">
            <img src={previewUrl} alt="你上传的猫图" />
          </div>
          <span className="card-wait__thumb-label">你的主子</span>
        </div>
      ) : null}

      <p className="card-wait__title">🐱 喵言喵语翻译需要时间哦</p>
      <div className="card-wait__bounce" aria-hidden>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
