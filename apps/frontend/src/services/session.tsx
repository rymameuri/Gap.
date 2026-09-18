import {
  createContext,
  useContext,
  useEffect,
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
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api<User>("/auth/me")
      .then(setUser)
      .catch((error) => {
        if (!(error instanceof ApiError && error.status === 401))
          console.error("Unable to restore sign-in");
      })
      .finally(() => setLoading(false));
  }, []);
  async function login(email: string, password: string) {
    const user = await post<User>("/auth/login", { email, password });
    setUser(user);
    return user;
  }
  async function logout() {
    await post("/auth/logout");
    setUser(null);
  }
  return <Session value={{ user, loading, login, logout }}>{children}</Session>;
}
export const useSession = () => useContext(Session);
