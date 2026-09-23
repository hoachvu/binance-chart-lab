import { eq, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { authAttempts, localAccounts, loginSessions, users } from "@/db/schema";
import { clearSessionCookie, hashPassword, PASSWORD_ITERATIONS, randomSalt, randomToken, sameHash, SESSION_AGE, setSessionCookie, sha256 } from "@/lib/local-auth";

export const runtime = "edge";

async function limit(key: string, maximum: number, duration: number, increment = true) {
  const db = getDb();
  const now = Date.now();
  const current = await db.select().from(authAttempts).where(eq(authAttempts.key, key)).get();
  if (current && current.resetAt > now && current.failures >= maximum) return false;
  if (increment) await db.insert(authAttempts).values({ key, failures: current && current.resetAt > now ? current.failures + 1 : 1, resetAt: current && current.resetAt > now ? current.resetAt : now + duration })
    .onConflictDoUpdate({ target: authAttempts.key, set: { failures: current && current.resetAt > now ? current.failures + 1 : 1, resetAt: current && current.resetAt > now ? current.resetAt : now + duration } });
  return true;
}

export async function POST(request: Request) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Yêu cầu không hợp lệ." }, { status: 403 });
  try {
    const body = await request.json() as { action?: string; username?: string; password?: string };
    const db = getDb();
    if (body.action === "logout") {
      const token = request.headers.get("cookie")?.match(/(?:^|;\s*)chartlab_session=([^;]+)/)?.[1];
      if (token) await db.delete(loginSessions).where(eq(loginSessions.tokenHash, await sha256(token)));
      return clearSessionCookie(Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }), request);
    }
    if (body.action !== "register" && body.action !== "login") return Response.json({ error: "Thao tác không hợp lệ." }, { status: 400 });
    const username = String(body.username ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return Response.json({ error: "Tên tài khoản cần 3–24 ký tự: chữ không dấu, số hoặc dấu gạch dưới." }, { status: 400 });
    if (password.length < 10 || password.length > 128) return Response.json({ error: "Mật khẩu cần từ 10 đến 128 ký tự." }, { status: 400 });
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const ipHash = await sha256(ip);
    const loginKey = `login:${await sha256(`${ipHash}:${username}`)}`;
    let userId: string;
    if (body.action === "register") {
      if (!await limit(`register:${ipHash}`, 5, 60 * 60 * 1000)) return Response.json({ error: "Tạo tài khoản quá nhiều lần. Vui lòng thử lại sau." }, { status: 429 });
      if (await db.select({ username: localAccounts.username }).from(localAccounts).where(eq(localAccounts.username, username)).get()) return Response.json({ error: "Tên tài khoản đã được dùng." }, { status: 409 });
      userId = crypto.randomUUID();
      const salt = randomSalt();
      const passwordHash = await hashPassword(password, salt);
      await db.insert(users).values({ id: userId, email: `${username}@local.chartlab.invalid`, role: "local", createdAt: Date.now() });
      try {
        await db.insert(localAccounts).values({ username, userId, salt, passwordHash, iterations: PASSWORD_ITERATIONS, createdAt: Date.now() });
      } catch {
        await db.delete(users).where(eq(users.id, userId));
        return Response.json({ error: "Tên tài khoản đã được dùng." }, { status: 409 });
      }
    } else {
      if (!await limit(loginKey, 8, 15 * 60 * 1000, false)) return Response.json({ error: "Đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút." }, { status: 429 });
      const row = await db.select().from(localAccounts).where(eq(localAccounts.username, username)).get();
      const calculated = await hashPassword(password, row?.salt || "AAAAAAAAAAAAAAAAAAAAAA", row?.iterations || PASSWORD_ITERATIONS);
      if (!row || !sameHash(calculated, row.passwordHash)) {
        await limit(loginKey, 8, 15 * 60 * 1000);
        return Response.json({ error: "Tên tài khoản hoặc mật khẩu không đúng." }, { status: 401 });
      }
      userId = row.userId;
      await db.delete(authAttempts).where(eq(authAttempts.key, loginKey));
    }
    const token = randomToken();
    await db.delete(loginSessions).where(lt(loginSessions.expiresAt, Date.now()));
    await db.insert(loginSessions).values({ tokenHash: await sha256(token), userId, expiresAt: Date.now() + SESSION_AGE * 1000 });
    return setSessionCookie(Response.json({ ok: true, username }, { headers: { "Cache-Control": "no-store" } }), token, request);
  } catch {
    return Response.json({ error: "Chưa thể xử lý tài khoản. Vui lòng thử lại." }, { status: 503 });
  }
}
