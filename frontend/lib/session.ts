import { createHmac } from "crypto";

// Simple signed admin cookie. The secret is intentionally optional: we use a
// stable built-in fallback so deployments don't need an extra env var. This is
// fine for an internal event check-in system where the only concern is stopping
// casual unauthorized access, not nation-state cookie forgery.

const ADMIN_COOKIE = "crow_admin";
const STATUS_COOKIE = "crow_admin_status";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const FALLBACK_SECRET = "project-crow-stable-session-key-do-not-change";

type AdminJwtPayload = {
  sub: string; // admin email
  iat: number;
  exp: number;
};

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(
    str.replace(/-/g, "+").replace(/_/g, "/") + padding,
    "base64",
  );
}

export function getSessionSecret(): string {
  return process.env.SESSION_SECRET || FALLBACK_SECRET;
}

export function signAdminToken(
  email: string,
  maxAgeSeconds = MAX_AGE,
): string {
  const secret = getSessionSecret();
  const header = base64UrlEncode(
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })),
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    Buffer.from(JSON.stringify({ sub: email, iat: now, exp: now + maxAgeSeconds })),
  );
  const sig = base64UrlEncode(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest(),
  );
  return `${header}.${payload}.${sig}`;
}

export function verifyAdminToken(
  token: string | undefined,
): AdminJwtPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const secret = getSessionSecret();
  const expected = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest();

  let sigBuf: Buffer;
  try {
    sigBuf = base64UrlDecode(signature);
  } catch {
    return null;
  }

  // Fast constant-time compare. Length check first prevents timingSafeEqual throw.
  if (sigBuf.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sigBuf.length; i++) diff |= sigBuf[i] ^ expected[i];
  if (diff !== 0) return null;

  try {
    const decoded = JSON.parse(
      base64UrlDecode(payload).toString("utf8"),
    ) as Partial<AdminJwtPayload>;
    if (!decoded.sub || typeof decoded.exp !== "number") return null;
    if (Math.floor(Date.now() / 1000) >= decoded.exp) return null;
    return decoded as AdminJwtPayload;
  } catch {
    return null;
  }
}

export function adminCookies(email: string) {
  const token = signAdminToken(email);
  return {
    token: {
      name: ADMIN_COOKIE,
      value: token,
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: MAX_AGE,
    },
    status: {
      name: STATUS_COOKIE,
      value: "1",
      httpOnly: false,
      sameSite: "lax" as const,
      path: "/",
      maxAge: MAX_AGE,
    },
  };
}

export { ADMIN_COOKIE, STATUS_COOKIE, MAX_AGE };
