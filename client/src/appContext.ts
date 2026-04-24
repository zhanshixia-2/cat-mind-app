import { createContext } from "react";

export type AuthedContextValue = {
  authed: boolean;
  onLogout: () => void | Promise<void>;
  onLoginSuccess: () => void;
};

export const AuthedContext = createContext<AuthedContextValue>({
  authed: false,
  onLogout: () => {},
  onLoginSuccess: () => {},
});
