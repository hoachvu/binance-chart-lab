import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { localAccounts } from "@/db/schema";
import { localAccount, hashPassword, sameHash, sha256, randomSalt, PASSWORD_ITERATIONS, clearSessionCookie } from "@/lib/local-auth";
import { mailConfigured, normalizeEmail, rateLimit, recoveryDb, sendAccountMail } from "@/lib/recovery";

const json = (body:unknown,status=200) => Response.json(body,{status,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer"}});
const generic = {ok:true,message:"Nếu thông tin khớp với tài khoản có email đã xác minh, bạn sẽ nhận được liên kết đặt lại mật khẩu."};
export async function GET() {
  const me = await localAccount();
  return json({configured:mailConfigured(),email:me?.recoveryEmail || null});
}
export async function POST(request:Request) {
  if (request.headers.get("Origin") && request.headers.get("Origin") !== new URL(request.url).origin) return json({error:"Yêu cầu không hợp lệ."},403);
  try {
    const raw = await request.text();
    if (raw.length>4096) return json({error:"Yêu cầu quá dài."},400);
    const body = JSON.parse(raw) as Record<string,unknown>;
    const ip = await sha256(request.headers.get("CF-Connecting-IP") || "unknown");
    if (!await rateLimit(`recovery-ip:${ip}`,15,60*60*1000)) return json({error:"Bạn thử quá nhiều lần. Vui lòng thử lại sau."},429);
    const db = recoveryDb();
    if (body.action === "forgot") {
      if (!mailConfigured()) return json({error:"Chưa cấu hình dịch vụ gửi email. Hãy liên hệ chủ web."},503);
      const email = normalizeEmail(body.email);
      if (!email) return json({error:"Email chưa hợp lệ."},400);
      if (!await rateLimit(`recovery-mail:${await sha256(email)}`,3,60*60*1000)) return json(generic);
      const row = await db.prepare("SELECT user_id FROM local_accounts WHERE recovery_email=?").bind(email).first<{user_id:string}>();
      if (row) {
        try { await sendAccountMail(row.user_id,email,"reset"); } catch { console.error("Account mail delivery failed"); }
      }
      return json(generic);
    }
    if (body.action === "link") {
      if (!mailConfigured()) return json({error:"Chưa cấu hình dịch vụ gửi email. Tài khoản và đăng nhập vẫn hoạt động."},503);
      const me = await localAccount();
      if (!me) return json({error:"Hãy đăng nhập trước."},401);
      const email = normalizeEmail(body.email), password = String(body.password ?? "");
      if (!email || password.length<10 || password.length>128) return json({error:"Kiểm tra email và mật khẩu hiện tại."},400);
      if (!await rateLimit(`link:${me.id}`,5,60*60*1000)) return json({error:"Vui lòng thử lại sau."},429);
      const row = await getDb().select().from(localAccounts).where(eq(localAccounts.userId,me.id)).get();
      if (!row || !sameHash(await hashPassword(password,row.salt,row.iterations),row.passwordHash)) return json({error:"Mật khẩu hiện tại chưa đúng."},401);
      await sendAccountMail(me.id,email,"verify");
      return json({ok:true,message:"Đã gửi liên kết xác minh. Email chỉ được gắn vào tài khoản sau khi xác minh."});
    }
    if (body.action !== "verify" && body.action !== "reset") return json({error:"Thao tác không hợp lệ."},400);
    const token = String(body.token || "");
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return json({error:"Liên kết không hợp lệ hoặc đã hết hạn."},400);
    const hash = await sha256(token), now = Date.now();
    const row = await db.prepare("SELECT * FROM account_tokens WHERE token_hash=? AND purpose=? AND expires_at>?").bind(hash,body.action,now).first<{user_id:string;email:string}>();
    if (!row) return json({error:"Liên kết đã dùng hoặc hết hạn. Hãy yêu cầu một liên kết mới."},400);
    if (body.action === "verify") {
      // Conditional update + deletion in one transaction prevents replay races.
      const results = await db.batch([
        db.prepare("UPDATE local_accounts SET recovery_email=? WHERE user_id=? AND EXISTS(SELECT 1 FROM account_tokens WHERE token_hash=? AND expires_at>?)").bind(row.email,row.user_id,hash,Date.now()),
        db.prepare("DELETE FROM account_tokens WHERE token_hash=?").bind(hash),
      ]);
      if (!results[0].meta.changes) return json({error:"Liên kết đã hết hạn hoặc đã dùng."},400);
      return json({ok:true,message:"Đã xác minh email. Bạn có thể dùng email này để khôi phục mật khẩu."});
    }
    const password = String(body.password || "");
    if (password.length<10 || password.length>128) return json({error:"Mật khẩu cần 10–128 ký tự."},400);
    const salt = randomSalt(), passwordHash = await hashPassword(password,salt);
    const results = await db.batch([
      db.prepare("UPDATE local_accounts SET password_hash=?,salt=?,iterations=? WHERE user_id=? AND recovery_email=? AND EXISTS(SELECT 1 FROM account_tokens WHERE token_hash=? AND expires_at>?)").bind(passwordHash,salt,PASSWORD_ITERATIONS,row.user_id,row.email,hash,Date.now()),
      db.prepare("DELETE FROM login_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM account_tokens WHERE token_hash=? AND expires_at>?)").bind(row.user_id,hash,Date.now()),
      db.prepare("DELETE FROM account_tokens WHERE user_id=?").bind(row.user_id),
    ]);
    if (!results[0].meta.changes) return json({error:"Liên kết đã dùng hoặc email tài khoản đã thay đổi."},400);
    return clearSessionCookie(json({ok:true,message:"Đã đổi mật khẩu và đăng xuất các thiết bị. Hãy đăng nhập lại."}),request);
  } catch {
    return json({error:"Chưa thể xử lý. Email có thể đã được dùng hoặc dịch vụ tạm thời chưa sẵn sàng."},503);
  }
}
