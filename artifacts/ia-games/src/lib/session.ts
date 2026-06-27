// ─── Session token store ─────────────────────────────────────────────────────
// Holds the signed HMAC session token issued by the API login endpoints
// (/auth/telegram/validate, by-wallet, POST /users). The token is attached as
// an `Authorization: Bearer <token>` header on every API request so the backend
// can authorize the caller. Kept in localStorage so it survives reloads.

const TOKEN_KEY = "ia_games_session_token";

export function saveSessionToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}
