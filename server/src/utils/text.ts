/** 按 Unicode 码点截断（适合中文） */
export function truncateUnicode(text: string, maxChars: number): string {
  const arr = Array.from(text);
  if (arr.length <= maxChars) return text;
  return arr.slice(0, maxChars).join("");
}
