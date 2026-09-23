import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { localAccounts, loginSessions, users } from "@/db/schema";

export const SESSION_COOKIE = "chartlab_session";
export const SESSION_AGE = 30 * 24 * 60 * 60;
// Cloudflare Workers caps each PBKDF2 deriveBits call at 100,000 iterations.
// Chain six bounded calls so a stored password still costs 600,000 iterations.
export const PASSWORD_ITERATIONS = 600_000;
const PBKDF2_CALL_LIMIT = 100_000;

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
  if (!Number.isSafeInteger(iterations) || iterations < PBKDF2_CALL_LIMIT || iterations > 1_000_000) throw new Error("Invalid password work factor");
  const base64 = salt.replace(/-/g, "+").replace(/_/g, "/");
  const saltBytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), char => char.charCodeAt(0));
  if (saltBytes.length !== 16) throw new Error("Invalid password salt");
  let material: Uint8Array<ArrayBuffer> = new TextEncoder().encode(password);
  for (let round = 0, remaining = iterations; remaining > 0; round++) {
    const roundSalt = new Uint8Array(saltBytes.length + 1);
    roundSalt.set(saltBytes);
    roundSalt[saltBytes.length] = round;
    const key = await crypto.subtle.importKey("raw", material, "PBKDF2", false, ["deriveBits"]);
    const work = Math.min(remaining, PBKDF2_CALL_LIMIT);
    material = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: roundSalt, iterations: work, hash: "SHA-256" }, key, 256));
    remaining -= work;
  }
  return encode(material);
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
