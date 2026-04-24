import { useCallback, useEffect, useState } from "react";
import { fetchMyReadings, takedownPlazaPost } from "./api";
import type { MyReadingItem } from "./api";
import "./App.css";

export function MyCatsPage() {
  const [items, setItems] = useState<MyReadingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [actionId, setActionId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const { items: list } = await fetchMyReadings();
      setItems(list);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function takedown(plazaId: number) {
    setActionId(plazaId);
    setErr(null);
    try {
      await takedownPlazaPost(plazaId);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "下架失败");
    } finally {
      setActionId(null);
    }
  }

  return (
    <>
      <div className="my-cats">
        {loading ? <p className="plaza-state">加载中…</p> : null}
        {err ? <p className="plaza-state plaza-state--err">{err}</p> : null}
        {!loading && items.length === 0 && !err ? (
          <p className="plaza-state">还没有记录，去「读猫话」玩一次吧～</p>
        ) : null}
        <ul className="plaza-feed my-cats__feed" aria-label="读猫历史">
          {items.map((r) => (
            <li key={r.id} className="plaza-card my-cats-card">
              {r.imageUrl ? (
                <div className="plaza-card__img-wrap">
                  <img
                    className="plaza-card__img"
                    src={r.imageUrl}
                    alt=""
                    loading="lazy"
                  />
                </div>
              ) : (
                <div className="my-cats-card__text-only" aria-label="未发广场，仅文字">
                  <p className="my-cats-card__text-preview">{r.text}</p>
                </div>
              )}
              <div className="my-cats-card__meta-row">
                <time
                  className="my-cats-card__date"
                  dateTime={r.createdAt}
                >
                  {r.createdAt.slice(0, 10)}
                </time>
                {r.plaza?.onPlaza && r.plaza.canTakedown ? (
                  <button
                    type="button"
                    className="btn-takedown btn-takedown--inline"
                    disabled={actionId === r.plaza.id}
                    onClick={() => {
                      if (r.plaza) void takedown(r.plaza.id);
                    }}
                  >
                    {actionId === r.plaza.id ? "处理中…" : "下架"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
