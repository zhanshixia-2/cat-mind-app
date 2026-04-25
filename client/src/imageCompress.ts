/**
 * 与后端 `maxFileBytes` 对齐，并预留 multipart 与反向代理的少量开销。
 * 见 server `config.maxFileBytes`（5 * 1024 * 1024）
 */
export const MAX_CAT_PHOTO_BYTES = 5 * 1024 * 1024 - 32 * 1024;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const u = URL.createObjectURL(file);
    const im = new Image();
    im.decoding = "async";
    im.onload = () => {
      URL.revokeObjectURL(u);
      resolve(im);
    };
    im.onerror = () => {
      URL.revokeObjectURL(u);
      reject(new Error("无法读取该图片，请换 JPG/PNG 等常见格式重试。"));
    };
    im.src = u;
  });
}

/**
 * 若已小于等于上限则原样返回；否则自动压成 JPEG 并降尺寸/画质，至多为 `maxBytes`。
 * 失败时抛错，供上层用中文提示，不向用户展示技术细节。
 */
export async function compressImageFileIfLarge(
  file: File,
  maxBytes: number = MAX_CAT_PHOTO_BYTES,
): Promise<File> {
  if (file.size <= maxBytes) {
    return file;
  }
  const img = await loadImage(file);
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  if (w < 1 || h < 1) {
    throw new Error("图片尺寸异常，请换一张再试。");
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("当前环境无法处理图片，请换浏览器或稍后再试。");
  }
  const cap = 4096;
  if (w > cap || h > cap) {
    const r = Math.min(cap / w, cap / h, 1);
    w = Math.max(1, Math.floor(w * r));
    h = Math.max(1, Math.floor(h * r));
  }
  let q = 0.88;
  for (let round = 0; round < 48; round++) {
    canvas.width = w;
    canvas.height = h;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const blob: Blob | null = await new Promise((res) => {
      canvas.toBlob((b) => res(b), "image/jpeg", q);
    });
    if (blob && blob.size <= maxBytes) {
      const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
      return new File([blob], name, { type: "image/jpeg" });
    }
    if (blob && q > 0.42) {
      q -= 0.04;
      continue;
    }
    if (w > 320 && h > 320) {
      w = Math.max(256, Math.floor(w * 0.87));
      h = Math.max(256, Math.floor(h * 0.87));
      q = 0.88;
    } else {
      break;
    }
  }
  throw new Error(
    "这张图片即使用最省体积方式仍略大于网络允许的上限。请换一张更小的原图，或先缩小后再选择。",
  );
}
