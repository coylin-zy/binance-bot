import { cookies } from "next/headers";

const ACCESS_COOKIE = "ft_access";
const REFRESH_COOKIE = "ft_refresh";
const SESSION_USER = "ft_user";

export interface SessionTokens {
  accessToken?: string;
  refreshToken: string;
}

export interface FreshSessionTokens extends SessionTokens {
  accessToken: string;
}

const sessionOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};

export async function setTokenCookies(tokens: FreshSessionTokens) {
  const store = await cookies();
  store.set(ACCESS_COOKIE, tokens.accessToken, { ...sessionOptions, maxAge: 60 * 15 });
  store.set(REFRESH_COOKIE, tokens.refreshToken, { ...sessionOptions, maxAge: 60 * 60 * 24 * 7 });
}

export async function setSession(tokens: FreshSessionTokens, username: string) {
  await setTokenCookies(tokens);
  const store = await cookies();
  store.set(SESSION_USER, username, { ...sessionOptions, maxAge: 60 * 60 * 24 * 7 });
}

export async function getSession(): Promise<SessionTokens | null> {
  const store = await cookies();
  const access = store.get(ACCESS_COOKIE)?.value;
  const refresh = store.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;
  return { accessToken: access, refreshToken: refresh };
}

export async function clearSession() {
  const store = await cookies();
  [ACCESS_COOKIE, REFRESH_COOKIE, SESSION_USER].forEach((c) => {
    store.set(c, "", { ...sessionOptions, maxAge: 0 });
  });
}

export async function getUsername(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_USER)?.value ?? null;
}
