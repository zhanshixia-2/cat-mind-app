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

type NdjsonLine =
  | { type: "meta"; ok: true; remaining: number }
  | { type: "delta"; text: string }
  | {
      type: "error";
      ok: false;
      code: string;
      message: string;
      remaining: number;
    }
  | { type: "done" };

export type AnalyzePhotoStreamCallbacks = {
  onMeta: (remaining: number) => void;
  onDelta: (text: string) => void;
  onError: (fail: AnalyzeFail) => void;
  onDone: () => void;
};

/** multipart 上传；响应为 NDJSON 流（application/x-ndjson） */
export async function analyzePhotoStream(
  file: File,
  callbacks: AnalyzePhotoStreamCallbacks,
): Promise<void> {
  const fd = new FormData();
  fd.append("photo", file);
  const res = await fetch("/api/cat/analyze", {
    method: "POST",
    credentials: "include",
    body: fd,
  });

  const ct = res.headers.get("content-type") ?? "";

  if (res.status === 429) {
    const data = (await parseJson(res)) as { error?: string };
    callbacks.onError({
      ok: false,
      code: "RATE_LIMIT",
      message: String(data.error ?? "额度已用完"),
      remaining: 0,
    });
    return;
  }

  if (!res.ok && ct.includes("application/json")) {
    const data = (await parseJson(res)) as { error?: string };
    throw new Error(String(data.error ?? "请求失败"));
  }

  if (!res.ok) {
    throw new Error(`请求失败 (${res.status})`);
  }

  if (!ct.includes("ndjson") && !ct.includes("x-ndjson")) {
    throw new Error("响应格式异常");
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error("无法读取响应流");
  }

  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let row: NdjsonLine;
      try {
        row = JSON.parse(line) as NdjsonLine;
      } catch {
        continue;
      }
      if (row.type === "meta" && row.ok) {
        callbacks.onMeta(row.remaining);
      } else if (row.type === "delta") {
        callbacks.onDelta(row.text);
      } else if (row.type === "error" && !row.ok) {
        callbacks.onError({
          ok: false,
          code: row.code,
          message: row.message,
          remaining: row.remaining,
        });
        return;
      } else if (row.type === "done") {
        callbacks.onDone();
        return;
      }
    }
  }

  throw new Error("连接已关闭，未收到完整结果");
}
