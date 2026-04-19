/** 内存计数，适合单机小流量；多实例需换 Redis 等 */

let state: { date: string; count: number } = { date: "", count: 0 };

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyUsage(limit: number): {
  date: string;
  used: number;
  remaining: number;
  limit: number;
} {
  const d = todayKey();
  if (state.date !== d) {
    state = { date: d, count: 0 };
  }
  const used = state.count;
  return {
    date: d,
    used,
    remaining: Math.max(0, limit - used),
    limit,
  };
}

/** 尝试占用一次当日额度，成功返回 true */
export function tryConsumeDailySlot(limit: number): {
  ok: boolean;
  remaining: number;
} {
  const d = todayKey();
  if (state.date !== d) {
    state = { date: d, count: 0 };
  }
  if (state.count >= limit) {
    return { ok: false, remaining: 0 };
  }
  state.count += 1;
  return { ok: true, remaining: limit - state.count };
}

/** 若后续流程失败，退回一次额度（可选） */
export function refundDailySlot(): void {
  if (state.count > 0) state.count -= 1;
}
