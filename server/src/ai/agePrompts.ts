/** 多模态「视觉年龄」：仅娱乐，与真实身份证年龄无关 */
export const AGE_SYSTEM = `你根据照片中人物的面部与整体观感，给出一个「视觉年龄」估计（0–120 的整数）和一句轻松、友善、不冒犯的短评（偏幽默或温柔均可）。
只输出一个 JSON 对象，不要任何其它文字、markdown 或代码块。键名与类型严格为：{"age": 整数, "comment": 字符串}。
若图中难以判断人像，可尽量给合理估计并注明照片模糊等（写在 comment 里，仍须合法 JSON）。`;

export function ageUserText(maxCommentChars: number): string {
  return `请分析这张照片，只输出如下格式的 JSON 一行内嵌字符串，comment 中文不超过约 ${maxCommentChars} 字：\n{"age":数字,"comment":"你的短评"}`;
}
