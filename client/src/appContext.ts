import { createContext } from "react";
import type { AuthUser } from "./api";

export type AuthedContextValue = {
  authed: boolean;
  user: AuthUser | null;
  onLogout: () => void | Promise<void>;
  onLoginSuccess: (u: AuthUser) => void;
  refreshAuth: () => Promise<void>;
};

export const AuthedContext = createContext<AuthedContextValue>({
  authed: false,
  user: null,
  onLogout: () => {},
  onLoginSuccess: () => {
    return;
  },
  refreshAuth: async () => {
    return;
  },
});
