import { env } from "cloudflare:workers";
import { randomToken, sha256 } from "./local-auth";

export function recoveryDb() {
  if (!env.DB) throw Error("Missing DB");
  return env.DB;
}
export function mailConfigured() {
  const config = env as unknown as Record<string, unknown>;
  return !!(config.RESEND_API_KEY && config.MAIL_FROM && config.APP_ORIGIN);
}
export async function rateLimit(key: string, max: number, period: number) {
  const now = Date.now();
  const row = await recoveryDb().prepare(`INSERT INTO auth_attempts (key,failures,reset_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET failures=CASE WHEN reset_at<=? THEN 1 ELSE failures+1 END,
    reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING failures`).bind(key,now+period,now,now).first<{failures:number}>();
  return !!row && row.failures <= max;
}
export function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ? email : null;
}
export async function sendAccountMail(userId: string, email: string, purpose: "verify" | "reset") {
  const config = env as unknown as Record<string,string>;
  if (!mailConfigured()) throw Error("Mail unavailable");
  const token = randomToken(), hash = await sha256(token), now = Date.now();
  // Tokens never appear in query strings, server logs, or the database in plaintext.
  const origin = new URL(config.APP_ORIGIN);
  if (origin.protocol !== "https:") throw Error("Invalid mail origin");
  const url = `${origin.origin}/account/${purpose}#token=${token}`;
  const subject = purpose === "reset" ? "Đặt lại mật khẩu Chart Lab" : "Xác minh email Chart Lab";
  const label = purpose === "reset" ? "Đặt lại mật khẩu" : "Xác minh email";
  await recoveryDb().batch([
    recoveryDb().prepare("DELETE FROM account_tokens WHERE expires_at<=? OR (user_id=? AND purpose=?)").bind(now,userId,purpose),
    recoveryDb().prepare("INSERT INTO account_tokens(token_hash,user_id,email,purpose,expires_at) VALUES (?,?,?,?,?)").bind(hash,userId,email,purpose,now+30*60*1000),
  ]);
  try {
    const result = await fetch("https://api.resend.com/emails", { method:"POST", signal:AbortSignal.timeout(12000), headers:{Authorization:`Bearer ${config.RESEND_API_KEY}`,"Content-Type":"application/json"}, body:JSON.stringify({from:config.MAIL_FROM,to:[email],subject,text:`${label}: ${url}\nLiên kết có hiệu lực 30 phút và chỉ dùng một lần. Nếu bạn không yêu cầu, hãy bỏ qua thư này.`}) });
    if (!result.ok) throw Error("Mail delivery rejected");
  } catch (error) {
    await recoveryDb().prepare("DELETE FROM account_tokens WHERE token_hash=?").bind(hash).run();
    throw error;
  }
}
