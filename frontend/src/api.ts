// API client — attaches the JWT from secure storage to every request.
import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
export const TOKEN_KEY = "panic_auth_token";

export async function getToken(): Promise<string | null> {
  return storage.secureGet(TOKEN_KEY, null);
}
export async function setToken(token: string): Promise<void> {
  await storage.secureSet(TOKEN_KEY, token);
}
export async function clearToken(): Promise<void> {
  await storage.secureRemove(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; body?: any; auth?: boolean } = {},
): Promise<T> {
  const { method = "GET", body, auth = true } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) {
    const token = await getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(data?.detail || "Request failed", res.status);
  }
  return data as T;
}

export const api = {
  register: (email: string, username: string, password: string) =>
    request<{ token: string; user: any }>("/auth/register", {
      method: "POST",
      body: { email, username, password },
      auth: false,
    }),
  login: (email: string, password: string) =>
    request<{ token: string; user: any }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    }),
  me: () => request<{ user: any }>("/auth/me"),
  profile: () => request<{ user: any }>("/profile"),
  stats: () => request<any>("/stats"),
  abilities: () => request<{ equipped: string | null; abilities: any[] }>("/abilities"),
  equipAbility: (ability_id: string | null) =>
    request<{ user: any }>("/profile/ability", { method: "POST", body: { ability_id } }),
  cosmetics: () => request<{ equipped: any; categories: any }>("/cosmetics"),
  equipCosmetic: (category: string, item_id: string) =>
    request<{ user: any }>("/profile/cosmetic", {
      method: "POST",
      body: { category, item_id },
    }),
  joinMatch: () => request<{ match_id: string; pid: string }>("/match/join", { method: "POST" }),
  matchState: (id: string) => request<any>(`/match/${id}/state`),
  press: (id: string, use_ability: boolean) =>
    request<{ outcome: any; state: any }>(`/match/${id}/press`, {
      method: "POST",
      body: { use_ability },
    }),
  leaveMatch: (id: string) => request<any>(`/match/${id}/leave`, { method: "POST" }),
};
