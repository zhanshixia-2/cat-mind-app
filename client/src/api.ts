const jsonHeaders = { "Content-Type": "application/json" };

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || res.statusText };
  }
}

function isLikelyHtml(s: string): boolean {
  const t = s.slice(0, 100).trim().toLowerCase();
  return (
    t.startsWith("<!doctype") ||
    t.startsWith("<html") ||
    (s.length > 20 && t.startsWith("<") && t.includes("request entity") && t.includes("large")) ||
    (s.length > 5 && t.startsWith("<") && t.includes("nginx"))
  );
}

function shortJsonError(parsed: unknown): string | null {
  if (parsed && typeof parsed === "object" && "error" in parsed) {
    const e = (parsed as { error: unknown }).error;
    if (typeof e === "string" && e.length > 0 && e.length < 300 && !isLikelyHtml(e)) {
      return e;
    }
  }
  return null;
}

/** 不向前端透传 Nginx/网关的整页 HTML，只给可读原因 */
function friendlyApiFailure(
  status: number,
  bodyText: string,
  parsed: unknown,
  defaultMsg: string,
): string {
  if (status === 413) {
    return "图片仍超过网络或服务器允许的上传大小。本页会尽量在发送前压小，若仍失败请换更小的原图，或让管理员把网关的「允许上传大小」调大。";
  }
  if (status === 401) {
    return "登录状态已失效，请重新登录后再试。";
  }
  if (status >= 500) {
    return "服务暂时繁忙，请稍后再试。";
  }
  const fromJson = shortJsonError(parsed);
  if (fromJson) {
    return fromJson;
  }
  if (isLikelyHtml(bodyText) || (bodyText.length > 80 && isLikelyHtml(bodyText))) {
    if (bodyText.toLowerCase().includes("entity too large")) {
      return "网络或网关在拦截过大的图片。请换更小的原图，或让管理员在 Nginx 中提高 `client_max_body_size`。";
    }
    return "网络或网关返回了错误页面，不是应用本身的提示。可检查网络、图片是否过大、或让管理员检查反向代理与上传限制。";
  }
  if (bodyText && bodyText.length < 200 && !isLikelyHtml(bodyText)) {
    return bodyText;
  }
  return defaultMsg;
}

export type AuthUser = {
  id: number;
  email: string;
};

export type MeResult =
  | { ok: true; user: AuthUser }
  | { ok: false; code?: string };

export async function authMe(): Promise<MeResult> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  const data = (await parseJson(res)) as MeResult & { user?: AuthUser };
  if (!res.ok || !data.ok) {
    return { ok: false, code: "UNAUTHORIZED" };
  }
  if (data.user && typeof data.user.id === "number" && data.user.email) {
    return { ok: true, user: data.user };
  }
  return { ok: false };
}

/** 新邮箱则自动注册，已有邮箱则登录 */
export async function enterWithEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  const res = await fetch("/api/auth/enter", {
    method: "POST",
    headers: jsonHeaders,
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
  const data = (await parseJson(res)) as {
    ok?: boolean;
    user?: AuthUser;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.user) {
    throw new Error(String(data.error ?? "无法进入，请重试"));
  }
  return data.user;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}

export type Usage = {
  date: string;
  used: number;
  remaining: number;
  limit: number;
};

export async function fetchUsage(): Promise<Usage> {
  const res = await fetch("/api/cat/usage", { credentials: "include" });
  if (!res.ok) throw new Error("无法获取额度");
  return (await parseJson(res)) as Usage;
}

export type AnalyzeFail = {
  ok: false;
  code: string;
  message: string;
  remaining: number;
};

export type AnalyzeSuccess = {
  ok: true;
  text: string;
  remaining: number;
  /** 已登录为服务端记录 id；未登录为 null，登录后可通过 `persistReading` 落库 */
  readingId: number | null;
};

export type AnalyzeResult = AnalyzeSuccess | AnalyzeFail;

export async function analyzePhoto(file: File): Promise<AnalyzeResult> {
  const fd = new FormData();
  fd.append("photo", file);
  const res = await fetch("/api/cat/analyze", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const bodyText = await res.text();
  let parsed: unknown = null;
  try {
    if (bodyText) parsed = JSON.parse(bodyText) as unknown;
  } catch {
    parsed = null;
  }
  const data = parsed as
    | (AnalyzeResult & { error?: string; readingId?: number })
    | null;

  if (res.status === 429) {
    return {
      ok: false,
      code: "RATE_LIMIT",
      message: shortJsonError(parsed) ?? "今日额度已用完，请改日或稍后再试。",
      remaining: 0,
    };
  }

  if (res.status === 413) {
    return {
      ok: false,
      code: "PAYLOAD_TOO_LARGE",
      message:
        "图片体积仍超过网络或服务器允许的上限。本页在发送前会自动压图，请换更小的原图，或让管理员将网关/ Nginx 的上传体积限制调大。",
      remaining: 0,
    };
  }

  if (!res.ok) {
    return {
      ok: false,
      code: "HTTP_ERROR",
      message: friendlyApiFailure(
        res.status,
        bodyText,
        parsed,
        "读猫话未成功，请检查网络后重试。",
      ),
      remaining: 0,
    };
  }

  if (!data) {
    return {
      ok: false,
      code: "BAD_RESPONSE",
      message: "服务器返回内容异常，请稍后再试。",
      remaining: 0,
    };
  }

  if (data.ok === true && typeof data.text === "string") {
    if (data.readingId == null) {
      return {
        ok: true,
        text: data.text,
        remaining: data.remaining,
        readingId: null,
      };
    }
    const readingId =
      typeof data.readingId === "number" ? data.readingId : -1;
    if (readingId < 1) {
      return {
        ok: false,
        code: "BAD_RESPONSE",
        message: "数据不完整，请重新读取一次。",
        remaining: 0,
      };
    }
    return {
      ok: true,
      text: data.text,
      remaining: data.remaining,
      readingId,
    };
  }

  if (typeof data.ok === "boolean" && data.ok === false) {
    return data as AnalyzeFail;
  }

  return {
    ok: false,
    code: "BAD_RESPONSE",
    message: "服务器返回的数据格式异常，请稍后再试。",
    remaining: 0,
  };
}

/** 将未登录时生成的读猫结果落库（不再次消耗每日额度，仅登录后可调用） */
export async function persistReading(
  file: File,
  resultText: string,
): Promise<{ readingId: number; remaining: number }> {
  const fd = new FormData();
  fd.append("photo", file);
  fd.append("resultText", resultText);
  const res = await fetch("/api/cat/persist-reading", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const bodyText = await res.text();
  let parsed: unknown = null;
  try {
    if (bodyText) parsed = JSON.parse(bodyText) as unknown;
  } catch {
    parsed = null;
  }
  const data = parsed as {
    ok?: boolean;
    readingId?: number;
    remaining?: number;
    error?: string;
  } | null;
  if (!res.ok || !data?.ok || typeof data.readingId !== "number") {
    throw new Error(
      friendlyApiFailure(
        res.status,
        bodyText,
        parsed,
        "保存读猫记录未成功，请重试。",
      ),
    );
  }
  return {
    readingId: data.readingId,
    remaining: Number(data.remaining ?? 0),
  };
}

export type PlazaItem = {
  id: number;
  text: string;
  imageUrl: string;
  createdAt: string;
};

export type PlazaFeed = {
  items: PlazaItem[];
  nextCursor: number | null;
};

export async function fetchPlazaFeed(
  cursor: number | null = null,
): Promise<PlazaFeed> {
  const u = new URL("/api/plaza/posts", window.location.origin);
  if (cursor != null) u.searchParams.set("cursor", String(cursor));
  const res = await fetch(u.toString(), { credentials: "omit" });
  if (!res.ok) {
    const data = (await parseJson(res)) as { error?: string };
    throw new Error(String(data.error ?? "加载广场失败"));
  }
  return (await parseJson(res)) as PlazaFeed;
}

export async function postPlazaPost(
  image: File,
  text: string,
  userReadingId: number,
): Promise<{ ok: true; id: number; imageUrl: string }> {
  const fd = new FormData();
  fd.append("image", image);
  fd.append("text", text);
  fd.append("userReadingId", String(userReadingId));
  const res = await fetch("/api/plaza/posts", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const bodyText = await res.text();
  let parsed: unknown = null;
  try {
    if (bodyText) parsed = JSON.parse(bodyText) as unknown;
  } catch {
    parsed = null;
  }
  const data = parsed as {
    ok?: boolean;
    id?: number;
    imageUrl?: string;
    error?: string;
  } | null;
  if (!res.ok || !data?.ok) {
    throw new Error(
      friendlyApiFailure(
        res.status,
        bodyText,
        parsed,
        "发布到广场未成功，请重试。",
      ),
    );
  }
  return {
    ok: true,
    id: Number(data.id),
    imageUrl: String(data.imageUrl),
  };
}

export type MyReadingItem = {
  id: number;
  text: string;
  createdAt: string;
  /** 曾发过广场的长图；未发广场则为 null */
  imageUrl: string | null;
  plaza: {
    id: number;
    onPlaza: boolean;
    canTakedown: boolean;
  } | null;
};

export async function fetchMyReadings(): Promise<{ items: MyReadingItem[] }> {
  const res = await fetch("/api/my/readings", { credentials: "include" });
  if (!res.ok) {
    const data = (await parseJson(res)) as { error?: string };
    throw new Error(String(data.error ?? "加载失败"));
  }
  return (await parseJson(res)) as { items: MyReadingItem[] };
}

export async function takedownPlazaPost(postId: number): Promise<void> {
  const res = await fetch(`/api/my/plaza/${postId}/takedown`, {
    method: "POST",
    credentials: "include",
  });
  if (!res.ok) {
    const data = (await parseJson(res)) as { error?: string };
    throw new Error(String(data.error ?? "下架失败"));
  }
}
