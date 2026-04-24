const jsonHeaders = { "Content-Type": "application/json" };

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || res.statusText };
  }
}

export async function authMe(): Promise<boolean> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (!res.ok) return false;
  const data = (await parseJson(res)) as { ok?: boolean };
  return data.ok === true;
}

export async function login(password: string): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: jsonHeaders,
    credentials: "include",
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const data = (await parseJson(res)) as { error?: string };
    throw new Error(data.error ?? "登录失败");
  }
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
};

export type AnalyzeResult = AnalyzeSuccess | AnalyzeFail;

/** multipart 上传；响应为 JSON（{ ok: true, text, remaining } 或 { ok: false, ... }） */
export async function analyzePhoto(file: File): Promise<AnalyzeResult> {
  const fd = new FormData();
  fd.append("photo", file);
  const res = await fetch("/api/cat/analyze", {
    method: "POST",
    credentials: "include",
    body: fd,
  });

  if (res.status === 429) {
    const data = (await parseJson(res)) as { error?: string };
    return {
      ok: false,
      code: "RATE_LIMIT",
      message: String(data.error ?? "额度已用完"),
      remaining: 0,
    };
  }

  const data = (await parseJson(res)) as AnalyzeResult & { error?: string };

  if (!res.ok) {
    return {
      ok: false,
      code: "HTTP_ERROR",
      message: String(data.error ?? `请求失败 (${res.status})`),
      remaining: 0,
    };
  }

  if (typeof data.ok === "boolean") {
    return data as AnalyzeResult;
  }

  return {
    ok: false,
    code: "BAD_RESPONSE",
    message: "响应格式异常",
    remaining: 0,
  };
}

/** 广场单条 */
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
  /** 广场列表公开，无需 Cookie；带 cookie 也无妨 */
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
): Promise<{ ok: true; id: number; imageUrl: string }> {
  const fd = new FormData();
  fd.append("image", image);
  fd.append("text", text);
  const res = await fetch("/api/plaza/posts", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const data = (await parseJson(res)) as {
    ok?: boolean;
    id?: number;
    imageUrl?: string;
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(String(data.error ?? "发布失败"));
  }
  return {
    ok: true,
    id: Number(data.id),
    imageUrl: String(data.imageUrl),
  };
}
