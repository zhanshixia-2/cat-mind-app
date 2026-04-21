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
