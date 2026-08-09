/**
 * Kakao OAuth + "나에게 보내기" (send memo to self).
 *
 * Docs verified 2026-08-09:
 *   authorize  GET  https://kauth.kakao.com/oauth/authorize
 *   token      POST https://kauth.kakao.com/oauth/token
 *   send memo  POST https://kapi.kakao.com/v2/api/talk/memo/default/send
 *
 * Access tokens last ~12h, refresh tokens ~60 days. Kakao only returns a NEW
 * refresh token when the current one has under a month left, so a refresh
 * response with no `refresh_token` is the normal case and must never be treated
 * as "the token is gone".
 */

import { env, siteUrl } from "./env";
import { KEYS, redis } from "./redis";

/** Short-lived cookie carrying the OAuth `state` between start and callback. */
export const OAUTH_STATE_COOKIE = "kakao_oauth_state";

const AUTH_HOST = "https://kauth.kakao.com";
const API_HOST = "https://kapi.kakao.com";
const SCOPE = "talk_message";

/** Refresh the access token this long before it actually expires. */
const ACCESS_TOKEN_SKEW_MS = 5 * 60 * 1000;
/** Kakao's text template caps `text` at 200 characters. */
export const KAKAO_TEXT_LIMIT = 200;

export interface TokenState {
  refreshToken: string;
  /** ms epoch; when the refresh token itself dies and re-consent is required. */
  refreshTokenExpiresAt: number;
  accessToken?: string;
  /** ms epoch */
  accessTokenExpiresAt?: number;
  /** ms epoch of the original consent. */
  connectedAt: number;
}

export class KakaoError extends Error {
  /** True when the only fix is for the owner to log in and consent again. */
  readonly needsReauth: boolean;
  readonly detail: string;

  constructor(message: string, opts: { needsReauth?: boolean; detail?: string } = {}) {
    super(message);
    this.name = "KakaoError";
    this.needsReauth = opts.needsReauth ?? false;
    this.detail = opts.detail ?? "";
  }
}

interface KakaoTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

// ── token state ────────────────────────────────────────────────────────────

export async function readTokenState(): Promise<TokenState | null> {
  const raw = await redis().get<TokenState>(KEYS.tokens);
  if (!raw || typeof raw !== "object" || !raw.refreshToken) return null;
  return raw;
}

export async function writeTokenState(state: TokenState): Promise<void> {
  await redis().set(KEYS.tokens, state);
}

export async function clearTokenState(): Promise<void> {
  await redis().del(KEYS.tokens);
}

/** Outcome of the most recent keep-alive run, surfaced by /api/admin/status. */
export interface RefreshStatus {
  at: string;
  ok: boolean;
  daysRemaining?: number;
  error?: string;
}

export async function writeRefreshStatus(status: RefreshStatus): Promise<void> {
  try {
    await redis().set(KEYS.refreshStatus, status);
  } catch (error) {
    console.error("Failed to record refresh status", error);
  }
}

export async function readRefreshStatus(): Promise<RefreshStatus | null> {
  return (await redis().get<RefreshStatus>(KEYS.refreshStatus)) ?? null;
}

// ── OAuth ──────────────────────────────────────────────────────────────────

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env("KAKAO_REST_API_KEY"),
    redirect_uri: env("KAKAO_REDIRECT_URI"),
    response_type: "code",
    scope: SCOPE,
    state,
    // Always show the consent screen so a re-connect can't silently reuse a
    // half-scoped session.
    prompt: "login",
  });
  return `${AUTH_HOST}/oauth/authorize?${params.toString()}`;
}

async function postToken(body: Record<string, string>): Promise<KakaoTokenResponse> {
  const response = await fetch(`${AUTH_HOST}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });

  const text = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const error = (parsed as { error?: string } | null)?.error ?? "";
    // invalid_grant is Kakao's answer for an expired or revoked refresh token.
    throw new KakaoError(`Kakao token request failed (${response.status})`, {
      needsReauth: error === "invalid_grant",
      detail: text.slice(0, 500),
    });
  }

  const token = parsed as KakaoTokenResponse | null;
  if (!token?.access_token) {
    throw new KakaoError("Kakao token response had no access_token", {
      detail: text.slice(0, 500),
    });
  }
  return token;
}

/** One-time: turn the authorization code from the callback into stored tokens. */
export async function exchangeAuthorizationCode(code: string): Promise<TokenState> {
  const token = await postToken({
    grant_type: "authorization_code",
    client_id: env("KAKAO_REST_API_KEY"),
    client_secret: env("KAKAO_CLIENT_SECRET"),
    redirect_uri: env("KAKAO_REDIRECT_URI"),
    code,
  });

  if (!token.refresh_token) {
    throw new KakaoError("Kakao did not return a refresh token on first consent");
  }

  const now = Date.now();
  const state: TokenState = {
    refreshToken: token.refresh_token,
    refreshTokenExpiresAt: now + (token.refresh_token_expires_in ?? 60 * 24 * 3600) * 1000,
    accessToken: token.access_token,
    accessTokenExpiresAt: now + token.expires_in * 1000,
    connectedAt: now,
  };
  await writeTokenState(state);
  return state;
}

/**
 * Exchange the stored refresh token for a fresh access token.
 *
 * Called by the daily cron as well as on demand. Running it regularly is what
 * keeps the refresh token alive: Kakao reissues one once it drops under a month
 * of validity, so a token that is used daily never reaches its 60-day deadline.
 */
export async function refreshTokens(): Promise<TokenState> {
  const current = await readTokenState();
  if (!current) {
    throw new KakaoError("No Kakao tokens stored — run the one-time connect flow", {
      needsReauth: true,
    });
  }

  const token = await postToken({
    grant_type: "refresh_token",
    client_id: env("KAKAO_REST_API_KEY"),
    client_secret: env("KAKAO_CLIENT_SECRET"),
    refresh_token: current.refreshToken,
  });

  const now = Date.now();
  const next: TokenState = {
    ...current,
    accessToken: token.access_token,
    accessTokenExpiresAt: now + token.expires_in * 1000,
  };

  // Only rotate when Kakao actually hands us a new one. An absent
  // `refresh_token` means the existing one is still good.
  if (token.refresh_token) {
    next.refreshToken = token.refresh_token;
    next.refreshTokenExpiresAt =
      now + (token.refresh_token_expires_in ?? 60 * 24 * 3600) * 1000;
  }

  await writeTokenState(next);
  return next;
}

function accessTokenIsFresh(state: TokenState | null): state is TokenState & { accessToken: string } {
  return Boolean(
    state?.accessToken &&
      state.accessTokenExpiresAt &&
      state.accessTokenExpiresAt - Date.now() > ACCESS_TOKEN_SKEW_MS,
  );
}

/**
 * A usable access token, refreshing only when the cached one is spent.
 *
 * A short Redis lock keeps two concurrent refreshes from racing: if both ran in
 * the ~monthly window where Kakao rotates the refresh token, the loser's write
 * could overwrite the rotated token with the retired one.
 */
export async function getAccessToken(): Promise<string> {
  const cached = await readTokenState();
  if (accessTokenIsFresh(cached)) return cached.accessToken;

  const gotLock = await redis().set(KEYS.refreshLock, Date.now(), { nx: true, ex: 20 });
  if (!gotLock) {
    // Someone else is refreshing. Give them a moment, then take whatever is there.
    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(500);
      const state = await readTokenState();
      if (accessTokenIsFresh(state)) return state.accessToken;
    }
    // Lock holder failed or is slow — refresh anyway rather than give up.
    return (await refreshTokens()).accessToken!;
  }

  try {
    return (await refreshTokens()).accessToken!;
  } finally {
    await redis().del(KEYS.refreshLock);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── sending ────────────────────────────────────────────────────────────────

/** Send a text message to the owner's own KakaoTalk chat. */
export async function sendKakaoMemo(text: string): Promise<void> {
  const accessToken = await getAccessToken();
  const url = siteUrl();

  const templateObject = {
    object_type: "text",
    text: text.slice(0, KAKAO_TEXT_LIMIT),
    link: { web_url: url, mobile_web_url: url },
  };

  const response = await fetch(`${API_HOST}/v2/api/talk/memo/default/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }).toString(),
    cache: "no-store",
  });

  const body = await response.text();
  if (!response.ok) {
    throw new KakaoError(`Kakao memo send failed (${response.status})`, {
      needsReauth: response.status === 401,
      detail: body.slice(0, 500),
    });
  }

  let result: { result_code?: number } | null = null;
  try {
    result = JSON.parse(body);
  } catch {
    /* Kakao returned 2xx with a non-JSON body; treat the 2xx as success. */
  }
  if (result && result.result_code !== 0) {
    throw new KakaoError("Kakao memo send returned a non-zero result_code", {
      detail: body.slice(0, 500),
    });
  }
}
