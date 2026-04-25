import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import type { AuthUser } from "./api";
import { authMe, logout } from "./api";
import { AuthedContext } from "./appContext";
import { AppLayout } from "./AppLayout";
import { LoginPage } from "./LoginPage";
import { MyCatsPage } from "./MyCatsPage";
import { PlazaPage } from "./PlazaPage";
import { ReadCatPage } from "./ReadCatPage";
import { RequireAuth } from "./RequireAuth";
import "./App.css";

export function App() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshAuth = useCallback(async () => {
    const me = await authMe();
    if (me.ok) {
      setAuthed(true);
      setUser(me.user);
    } else {
      setAuthed(false);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await refreshAuth();
      setChecking(false);
    })();
  }, [refreshAuth]);

  const handleLogout = useCallback(async () => {
    await logout();
    setAuthed(false);
    setUser(null);
  }, []);

  const onLoginSuccess = useCallback((u: AuthUser) => {
    setAuthed(true);
    setUser(u);
  }, []);

  if (checking) {
    return (
      <div className="page page--checking">
        <p className="text-loading">加载中…</p>
      </div>
    );
  }

  return (
    <AuthedContext.Provider
      value={{
        authed,
        user,
        onLogout: handleLogout,
        onLoginSuccess,
        refreshAuth,
      }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<PlazaPage />} />
            <Route path="login" element={<LoginPage />} />
            <Route path="read" element={<ReadCatPage />} />
            <Route
              path="me"
              element={
                <RequireAuth>
                  <MyCatsPage />
                </RequireAuth>
              }
            />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthedContext.Provider>
  );
}
