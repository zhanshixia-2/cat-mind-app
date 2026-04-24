import { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthedContext } from "./appContext";

type Props = { children: React.ReactNode };

export function RequireAuth({ children }: Props) {
  const { authed } = useContext(AuthedContext);
  const loc = useLocation();
  if (!authed) {
    const to = `/login?redirect=${encodeURIComponent(`${loc.pathname}${loc.search}`)}`;
    return <Navigate to={to} replace />;
  }
  return <>{children}</>;
}
