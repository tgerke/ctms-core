/**
 * Web auth: dev mode uses the static bearer tokens from .env; oidc mode runs
 * an OIDC authorization-code + PKCE flow against the IdP named in
 * VITE_OIDC_ISSUER. Signing re-authentication (§11.200) re-runs the flow in a
 * popup with prompt=login so the IdP forces a fresh credential ceremony.
 */

// Build-time VITE_* values win; otherwise the runtime config nginx serves
// at /env.js, so one pinned image works against any IdP.
declare global {
  interface Window {
    __CTMS_ENV__?: Record<string, string | undefined>;
  }
}
const conf = (viteValue: unknown, runtimeKey: string): string | undefined =>
  (viteValue as string | undefined) ||
  (typeof window === "undefined" ? undefined : window.__CTMS_ENV__?.[runtimeKey]) ||
  undefined;

const OIDC = conf(import.meta.env.VITE_AUTH_MODE, "AUTH_MODE") === "oidc";
const ISSUER = conf(import.meta.env.VITE_OIDC_ISSUER, "OIDC_ISSUER");
const CLIENT_ID = conf(import.meta.env.VITE_OIDC_CLIENT_ID, "OIDC_CLIENT_ID");
const SCOPE = conf(import.meta.env.VITE_OIDC_SCOPE, "OIDC_SCOPE") ?? "openid email profile";

export const authMode = OIDC ? ("oidc" as const) : ("dev" as const);

export function token(): string | null {
  if (!OIDC) return localStorage.getItem("ctms_token") ?? "dev-admin-token";
  return sessionStorage.getItem("ctms_oidc_token");
}

// --- PKCE plumbing -----------------------------------------------------------

interface Endpoints {
  authorization_endpoint: string;
  token_endpoint: string;
}

let endpointsCache: Endpoints | null = null;
async function endpoints(): Promise<Endpoints> {
  if (endpointsCache) return endpointsCache;
  if (!ISSUER || !CLIENT_ID) {
    throw new Error("VITE_AUTH_MODE=oidc requires VITE_OIDC_ISSUER and VITE_OIDC_CLIENT_ID");
  }
  const url = new URL(
    ".well-known/openid-configuration",
    ISSUER.endsWith("/") ? ISSUER : `${ISSUER}/`,
  );
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status})`);
  endpointsCache = (await res.json()) as Endpoints;
  return endpointsCache;
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

const redirectUri = () => `${window.location.origin}/`;

async function authorizeUrl(state: string, challenge: string, forceLogin: boolean) {
  const { authorization_endpoint } = await endpoints();
  const url = new URL(authorization_endpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", CLIENT_ID!);
  url.searchParams.set("redirect_uri", redirectUri());
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Force a fresh credential ceremony for signing re-auth.
  if (forceLogin) {
    url.searchParams.set("prompt", "login");
    url.searchParams.set("max_age", "0");
  }
  return url;
}

async function exchangeCode(code: string, verifier: string): Promise<string> {
  const { token_endpoint } = await endpoints();
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: CLIENT_ID!,
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

// --- login (full redirect) -----------------------------------------------------

export async function beginLogin(): Promise<void> {
  const { verifier, challenge } = await pkcePair();
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(`ctms_pkce_${state}`, verifier);
  sessionStorage.setItem("ctms_return_to", window.location.pathname + window.location.search);
  window.location.assign(String(await authorizeUrl(state, challenge, false)));
}

/**
 * Handle an OIDC redirect landing (?code=&state=). Call once at app start,
 * before rendering. In a re-auth popup, posts the fresh token back to the
 * opener and closes; in the main window, stores the session token.
 */
export async function completeLoginFromCallback(): Promise<void> {
  if (!OIDC) return;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return;
  const verifier = sessionStorage.getItem(`ctms_pkce_${state}`);
  if (!verifier) return;
  sessionStorage.removeItem(`ctms_pkce_${state}`);
  const accessToken = await exchangeCode(code, verifier);

  if (window.opener) {
    (window.opener as Window).postMessage(
      { type: "ctms-reauth", token: accessToken },
      window.location.origin,
    );
    window.close();
    return;
  }
  sessionStorage.setItem("ctms_oidc_token", accessToken);
  const returnTo = sessionStorage.getItem("ctms_return_to") ?? "/";
  sessionStorage.removeItem("ctms_return_to");
  window.history.replaceState(null, "", returnTo);
}

export async function ensureSignedIn(): Promise<void> {
  if (OIDC && !token()) await beginLogin();
}

// --- signing re-authentication ---------------------------------------------------

/**
 * Obtain proof of re-authentication for a signature. Dev mode restates the
 * bearer token (the API's documented stub); oidc mode runs a prompt=login
 * PKCE flow in a popup and resolves with the fresh access token.
 */
export async function getReauthToken(): Promise<string> {
  if (!OIDC) return token()!;
  const { verifier, challenge } = await pkcePair();
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(`ctms_pkce_${state}`, verifier);
  const url = await authorizeUrl(state, challenge, true);
  const popup = window.open(String(url), "ctms-reauth", "popup,width=480,height=640");
  if (!popup) throw new Error("re-authentication popup was blocked");
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("re-authentication timed out"));
    }, 120_000);
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; token?: string };
      if (data?.type !== "ctms-reauth" || !data.token) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(data.token);
    }
    window.addEventListener("message", onMessage);
  });
}
