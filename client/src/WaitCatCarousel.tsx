import { useEffect, useMemo, useState } from "react";
import { WAIT_CAT_IMAGE_URLS } from "./waitCatImages";

const TIPS = [
  "猫的一天大约有 2/3 在打盹～",
  "慢工出细活，主子的话值得等。",
  "喵星人靠胡须感知空间宽窄。",
  "此刻可能在翻译「喵言喵语」…",
  "摇摇尾巴不一定是开心哦。",
];

const ROTATE_MS = 2000;
const PRELOAD_HEAD = 5;

type Props = {
  active: boolean;
};

export function WaitCatCarousel({ active }: Props) {
  const n = WAIT_CAT_IMAGE_URLS.length;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active) {
      setIndex(0);
      return;
    }
    setIndex(0);
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % n);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [active, n]);

  useEffect(() => {
    if (!active) return;
    WAIT_CAT_IMAGE_URLS.slice(0, PRELOAD_HEAD).forEach((src) => {
      const im = new Image();
      im.src = src;
    });
  }, [active]);

  const tip = useMemo(() => TIPS[index % TIPS.length], [index]);

  const src = WAIT_CAT_IMAGE_URLS[index] ?? "";
  const displayNum = index + 1;

  if (!active) return null;

  return (
    <section
      className="wait-cats"
      aria-busy="true"
      aria-label="生成中，正在展示示意猫图"
    >
      <div className="wait-cats__header">
        <h2 className="wait-cats__title">喵言喵语翻译需要时间哦</h2>
      </div>

      <div className="wait-cats__viewport">
        <img
          key={src}
          src={src}
          alt=""
          className="wait-cats__img"
          decoding="async"
          onError={() => {
            setIndex((i) => (i + 1) % n);
          }}
        />
      </div>
      <p className="wait-cats__tip" aria-live="polite">
        {tip}
      </p>
    </section>
  );
}
