// API client — attaches the JWT from secure storage to every request.
import { storage } from "@/src/utils/storage";

const BASE = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api`;
export const TOKEN_KEY = "panic_auth_token";

// WebSocket URL for the real-time match transport (falls back to http polling).
export function matchWsUrl(matchId: string, token: string): string {
  const base = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/^http/, "ws");
  return `${base}/api/match/${matchId}/ws?token=${encodeURIComponent(token)}`;
}

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
  guest: (username: string) =>
    request<{ token: string; user: any }>("/auth/guest", {
      method: "POST",
      body: { username },
      auth: false,
    }),
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
  changeName: (username: string) =>
    request<{ user: any }>("/profile/name", { method: "POST", body: { username } }),
  rewardsStatus: () =>
    request<{ can_claim: boolean; current_streak: number; next_streak: number; next_reward: number; next_is_weekly: boolean }>(
      "/rewards/status",
    ),
  claimReward: () =>
    request<{ claimed: number; streak: number; is_weekly: boolean; user: any }>("/rewards/claim", {
      method: "POST",
    }),
  adsStatus: () =>
    request<{
      mandatory_due: boolean;
      cooldown_remaining: number;
      reward: number;
      reward_available: boolean;
      can_watch: boolean;
      already_claimed: boolean;
    }>("/ads/status"),
  adsSeen: () => request<{ mandatory_due: boolean; cooldown_remaining: number }>("/ads/seen", { method: "POST" }),
  claimAdReward: () => request<{ rewarded: number; user: any }>("/ads/reward", { method: "POST" }),
  friends: () => request<{ friend_code: string; friends: any[] }>("/friends"),
  addFriend: (code: string) =>
    request<{ added: any }>("/friends/add", { method: "POST", body: { code } }),
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
  leaderboard: (scope: "global" | "friends", period: "season" | "alltime") =>
    request<{ scope: string; period: string; rows: any[]; my_rank: number | null; season_id: string; reset_seconds: number }>(
      `/leaderboard?scope=${scope}&period=${period}`,
    ),
  challenges: () =>
    request<{ date: string; challenges: any[]; completed: number; total: number }>("/challenges"),
  recentChallenges: () =>
    request<{ challenges: { id: string; name: string; reward: number }[] }>("/challenges/recent"),
  claimChallenge: (id: string) =>
    request<{ claimed: number; user: any; challenges: any }>(`/challenges/claim/${id}`, {
      method: "POST",
    }),
  joinMatch: () => request<{ match_id: string; pid: string }>("/match/join", { method: "POST" }),
  createParty: () =>
    request<{ match_id: string; party_code: string; pid: string }>("/match/party/create", { method: "POST" }),
  joinParty: (code: string) =>
    request<{ match_id: string; party_code: string; pid: string }>("/match/party/join", {
      method: "POST",
      body: { code },
    }),
  matchState: (id: string) => request<any>(`/match/${id}/state`),
  press: (id: string, use_ability: boolean) =>
    request<{ outcome: any; state: any }>(`/match/${id}/press`, {
      method: "POST",
      body: { use_ability },
    }),
  leaveMatch: (id: string) => request<any>(`/match/${id}/leave`, { method: "POST" }),
  startMatch: (id: string) => request<any>(`/match/${id}/start`, { method: "POST" }),
};
