import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { localAccounts, loginSessions, users } from "@/db/schema";

export const SESSION_COOKIE = "chartlab_session";
export const SESSION_AGE = 30 * 24 * 60 * 60;
export const PASSWORD_ITERATIONS = 310_000;

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomToken(): string {
  return encode(crypto.getRandomValues(new Uint8Array(32)));
}

export function randomSalt(): string {
  return encode(crypto.getRandomValues(new Uint8Array(16)));
}

export async function sha256(value: string): Promise<string> {
  return encode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export async function hashPassword(password: string, salt: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBytes = Uint8Array.from(atob(salt.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));
  const hash = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" }, material, 256);
  return encode(new Uint8Array(hash));
}

export function sameHash(first: string, second: string): boolean {
  if (first.length !== second.length) return false;
  let diff = 0;
  for (let i = 0; i < first.length; i++) diff |= first.charCodeAt(i) ^ second.charCodeAt(i);
  return diff === 0;
}

export function setSessionCookie(response: Response, token: string, request: Request): Response {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_AGE}; Path=/; HttpOnly; SameSite=Lax${secure}`);
  return response;
}

export function clearSessionCookie(response: Response, request: Request): Response {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  response.headers.append("Set-Cookie", `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
  return response;
}

export async function localAccount() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const db = getDb();
  const session = await db.select().from(loginSessions).where(eq(loginSessions.tokenHash, await sha256(token))).get();
  if (!session || session.expiresAt <= Date.now()) return null;
  const account = await db.select({ username: localAccounts.username, id: users.id, role: users.role, email: users.email })
    .from(localAccounts).innerJoin(users, eq(localAccounts.userId, users.id))
    .where(eq(localAccounts.userId, session.userId)).get();
  return account ? { id: account.id, email: account.email, role: account.role, displayName: account.username } : null;
}
