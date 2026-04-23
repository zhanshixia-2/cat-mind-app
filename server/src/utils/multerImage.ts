/** 与常见浏览器 / 系统上报的 mimetype 对齐（含 image/jpg、image/pjpeg） */
export function isAllowedImageMimetype(mimetype: string): boolean {
  const m = (mimetype || "").toLowerCase().trim();
  if (!m) return false;
  if (m === "image/pjpeg" || m === "image/x-png") return true;
  return /^image\/(jpe?g|png|webp|gif)$/.test(m);
}
