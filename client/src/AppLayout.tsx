import { useContext, useEffect, useId, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AuthedContext } from "./appContext";

function UserMenuIcon() {
  return (
    <svg
      className="app-account-icon__svg"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-3.15 0-6 1.6-6 3.5V20h12v-2.5c0-1.9-2.85-3.5-6-3.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function AppLayout() {
  const { authed, onLogout } = useContext(AuthedContext);
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const isLoginPage = pathname === "/login";
  const isPlazaHome = pathname === "/";
  const readTarget = authed ? "/read" : "/login?redirect=/read";
  const meTarget = authed ? "/me" : "/login?redirect=/me";
  const [menuOpen, setMenuOpen] = useState(false);
  const accountWrapRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const loginRedirect = pathname + search;

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (
        accountWrapRef.current &&
        !accountWrapRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div
      className={isLoginPage ? "page page--login" : "page page--app"}
    >
      <div className="app-topbar app-topbar--grid">
        <div className="app-topbar__spacer" aria-hidden="true" />
        <nav className="app-nav app-nav--center" aria-label="主导航">
          <Link className="nav-link" to="/" end>
            广场
          </Link>
          <Link className="nav-link" to={readTarget}>
            读猫话
          </Link>
          <Link className="nav-link" to={meTarget}>
            我的
          </Link>
        </nav>
        <div className="app-topbar__account" ref={accountWrapRef}>
          <button
            type="button"
            className="btn-account-icon"
            aria-expanded={menuOpen}
            aria-haspopup="true"
            aria-controls={menuOpen ? menuId : undefined}
            onClick={() => {
              setMenuOpen((o) => !o);
            }}
          >
            <UserMenuIcon />
            <span className="visually-hidden">账户菜单</span>
          </button>
          {menuOpen ? (
            <ul
              id={menuId}
              className="app-account-menu"
              role="menu"
              aria-label="账户"
            >
              {authed ? (
                <li role="none">
                  <button
                    type="button"
                    className="app-account-menu__item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void onLogout();
                    }}
                  >
                    登出
                  </button>
                </li>
              ) : (
                <li role="none">
                  <button
                    type="button"
                    className="app-account-menu__item"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      void navigate(
                        "/login?redirect=" + encodeURIComponent(loginRedirect),
                      );
                    }}
                  >
                    登录
                  </button>
                </li>
              )}
            </ul>
          ) : null}
        </div>
      </div>
      <main className="app-main">
        <Outlet />
      </main>
      <footer
        className={
          isPlazaHome ? "app-footer app-footer--above-dock" : "app-footer"
        }
      >
        🐱 每只猫都有一肚子话想说
      </footer>
    </div>
  );
}
