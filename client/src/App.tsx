import { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { authMe, logout } from "./api";
import { AuthedContext } from "./appContext";
import { AppLayout } from "./AppLayout";
import { IndexRoute } from "./IndexRoute";
import { PlazaPage } from "./PlazaPage";
import "./App.css";

export function App() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    void authMe().then((ok) => {
      setAuthed(ok);
      setChecking(false);
    });
  }, []);

  const handleLogout = useCallback(async () => {
    await logout();
    setAuthed(false);
  }, []);

  const onLoginSuccess = useCallback(() => {
    setAuthed(true);
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
      value={{ authed, onLogout: handleLogout, onLoginSuccess }}
    >
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<IndexRoute />} />
            <Route path="plaza" element={<PlazaPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthedContext.Provider>
  );
}
