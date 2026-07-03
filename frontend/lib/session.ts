import { randomBytes, timingSafeEqual, createHmac } from "crypto";

// Minimal JWT helpers using Node's crypto module (runs in both Node runtime and
// Next.js middleware because crypto is a Node built-in). HS256 only.

const ADMIN_COOKIE = "crow_admin";
const STATUS_COOKIE = "crow_admin_status";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

type AdminJwtPayload = {
  sub: string; // admin email
  iat: number;
  exp: number;
};

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): Buffer {
  const padding = "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + padding, "base64");
}

export function signAdminToken(
  email: string,
  secret: string,
  maxAgeSeconds = MAX_AGE,
): string {
  const header = base64UrlEncode(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(
    Buffer.from(JSON.stringify({ sub: email, iat: now, exp: now + maxAgeSeconds })),
  );
  const sig = base64UrlEncode(createHmac("sha256", secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

export function verifyAdminToken(
  token: string | undefined,
  secret: string,
): AdminJwtPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expected = createHmac("sha256", secret).update(`${header}.${payload}`).digest();
  let sigBuf: Buffer;
  try {
    sigBuf = base64UrlDecode(signature);
  } catch {
    return null;
  }
  if (sigBuf.length !== expected.length) return null;

  const safeEqual = (a: Buffer, b: Buffer) => {
    try {
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  };

  if (!safeEqual(sigBuf, expected)) return null;

  try {
    const decoded = JSON.parse(base64UrlDecode(payload).toString("utf8")) as Partial<
      AdminJwtPayload
    >;
    if (!decoded.sub || typeof decoded.exp !== "number") return null;
    if (Math.floor(Date.now() / 1000) >= decoded.exp) return null;
    return decoded as AdminJwtPayload;
  } catch {
    return null;
  }
}

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error(
      "SESSION_SECRET is not set. Add a long random string to frontend/.env.local (e.g. openssl rand -hex 32).",
    );
  }
  return secret;
}

export function adminCookies(email: string) {
  const token = signAdminToken(email, getSessionSecret());
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

export function generateFallbackSecret(): string {
  return randomBytes(32).toString("hex");
}

export { ADMIN_COOKIE, STATUS_COOKIE, MAX_AGE };
