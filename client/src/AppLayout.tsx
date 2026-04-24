import { useContext } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AuthedContext } from "./appContext";

export function AppLayout() {
  const { authed, onLogout } = useContext(AuthedContext);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isLoginHome = !authed && pathname === "/";

  return (
    <div
      className={isLoginHome ? "page page--login" : "page page--app"}
    >
      <div className="app-topbar app-topbar--nav">
        <nav className="app-nav" aria-label="主导航">
          <Link className="nav-link" to="/" end>
            读猫话
          </Link>
          <Link className="nav-link" to="/plaza">
            广场
          </Link>
        </nav>
        {authed ? (
          <button
            type="button"
            className="btn-exit"
            onClick={() => {
              void onLogout();
            }}
          >
            退出
          </button>
        ) : (
          <button
            type="button"
            className="btn-exit"
            onClick={() => {
              void navigate("/");
            }}
          >
            登录
          </button>
        )}
      </div>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">🐱 每只猫都有一肚子话想说</footer>
    </div>
  );
}
