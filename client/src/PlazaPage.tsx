import { useCallback, useEffect, useState } from "react";
import type { PlazaItem } from "./api";
import { fetchPlazaFeed } from "./api";
import "./App.css";

export function PlazaPage() {
  const [items, setItems] = useState<PlazaItem[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (c: number | null, append: boolean) => {
    if (c === null && append) return;
    if (append) setLoadingMore(true);
    else setInitialLoading(true);
    setError(null);
    try {
      const { items: next, nextCursor } = await fetchPlazaFeed(
        append && c != null ? c : null,
      );
      if (append) {
        setItems((prev) => [...prev, ...next]);
      } else {
        setItems(next);
      }
      setCursor(nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setInitialLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    setCursor(null);
    void load(null, false);
  }, [load]);

  return (
    <>
      <header className="plaza-hero">
        <h1 className="plaza-hero__title">猫猫心里话广场</h1>
        <p className="plaza-hero__sub">看看别的主子说了啥</p>
      </header>

      <div className="plaza-page">
        {initialLoading && items.length === 0 ? (
          <p className="plaza-state">加载中…</p>
        ) : null}
        {error ? <p className="plaza-state plaza-state--err">{error}</p> : null}
        {!initialLoading && items.length === 0 && !error ? (
          <p className="plaza-state">还没有作品，去「读猫话」发一条到广场吧～</p>
        ) : null}

        <ul className="plaza-feed" aria-label="作品列表">
          {items.map((p) => (
            <li key={p.id} className="plaza-card">
              <div className="plaza-card__img-wrap">
                <img
                  className="plaza-card__img"
                  src={p.imageUrl}
                  alt=""
                  loading="lazy"
                />
              </div>
              {p.createdAt ? (
                <p className="plaza-card__meta" aria-hidden>
                  {p.createdAt.slice(0, 10)}
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        {cursor != null ? (
          <div className="plaza-load-more">
            <button
              type="button"
              className="btn-plaza-load"
              disabled={loadingMore}
              onClick={() => {
                void load(cursor, true);
              }}
            >
              {loadingMore ? "加载中…" : "加载更多"}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
