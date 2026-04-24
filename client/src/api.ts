const jsonHeaders = { "Content-Type": "application/json" };

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || res.statusText };
  }
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

export async function registerEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  const res = await fetch("/api/auth/register", {
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
    throw new Error(String(data.error ?? "注册失败"));
  }
  return data.user;
}

export async function loginEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  const res = await fetch("/api/auth/login", {
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
    throw new Error(String(data.error ?? "登录失败"));
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
  readingId: number;
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

  if (res.status === 429) {
    const data = (await parseJson(res)) as { error?: string };
    return {
      ok: false,
      code: "RATE_LIMIT",
      message: String(data.error ?? "额度已用完"),
      remaining: 0,
    };
  }

  const data = (await parseJson(res)) as AnalyzeResult & {
    error?: string;
    readingId?: number;
  };

  if (!res.ok) {
    return {
      ok: false,
      code: "HTTP_ERROR",
      message: String(data.error ?? `请求失败 (${res.status})`),
      remaining: 0,
    };
  }

  if (data.ok === true && typeof data.text === "string") {
    const readingId =
      typeof data.readingId === "number" ? data.readingId : -1;
    if (readingId < 1) {
      return {
        ok: false,
        code: "BAD_RESPONSE",
        message: "缺少 readingId",
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
    message: "响应格式异常",
    remaining: 0,
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
