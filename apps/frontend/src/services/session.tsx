import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, post, ApiError } from "./api";
import type { User } from "./types";
const Session = createContext<{
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}>({
  user: null,
  loading: true,
  login: async () => {
    throw new Error("Not initialized");
  },
  logout: async () => {},
});
const SESSION_CHANGE_KEY = "gap:session-change";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);

  useEffect(() => {
    let mounted = true;
    function refreshSession() {
      const version = ++requestVersion.current;
      api<User>("/auth/me")
        .then((currentUser) => {
          if (mounted && version === requestVersion.current)
            setUser(currentUser);
        })
        .catch((error) => {
          if (!mounted || version !== requestVersion.current) return;
          if (error instanceof ApiError && error.status === 401) setUser(null);
          else console.error("Unable to restore sign-in");
        })
        .finally(() => {
          if (mounted && version === requestVersion.current) setLoading(false);
        });
    }
    function onStorage(event: StorageEvent) {
      if (event.key === SESSION_CHANGE_KEY) refreshSession();
    }
    function onVisibilityChange() {
      if (!document.hidden) refreshSession();
    }
    refreshSession();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshSession);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      mounted = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshSession);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  function announceSessionChange() {
    try {
      window.localStorage.setItem(SESSION_CHANGE_KEY, crypto.randomUUID());
    } catch {
      // Focus and visibility checks still refresh tabs without local storage.
    }
  }

  async function login(email: string, password: string) {
    const nextUser = await post<User>("/auth/login", { email, password });
    requestVersion.current++;
    setUser(nextUser);
    setLoading(false);
    announceSessionChange();
    return nextUser;
  }
  async function logout() {
    await post("/auth/logout");
    requestVersion.current++;
    setUser(null);
    setLoading(false);
    announceSessionChange();
  }
  return <Session value={{ user, loading, login, logout }}>{children}</Session>;
}
export const useSession = () => useContext(Session);
