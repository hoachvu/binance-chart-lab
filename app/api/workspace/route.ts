import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { indicators, invitations, settings } from "@/db/schema";
import { account } from "@/lib/access";

export async function GET() {
  try {
    const me = await account();
    if (!me) return Response.json({me:{email:"",role:"guest",displayName:"Khách"},scripts:[],config:null,invites:[]},{headers:{"Cache-Control":"no-store"}});
    const db = getDb();
    const [scripts, config, invites] = await Promise.all([
      db.select().from(indicators).where(eq(indicators.ownerId, me.id)).orderBy(desc(indicators.updatedAt)).all(),
      db.select().from(settings).where(eq(settings.userId, me.id)).get(),
      me.role === "admin" ? db.select().from(invitations).all() : Promise.resolve([]),
    ]);
    return Response.json({me,scripts,config,invites},{headers:{"Cache-Control":"no-store"}});
  } catch { return Response.json({me:{email:"",role:"guest",displayName:"Khách"},scripts:[],config:null,invites:[]},{headers:{"Cache-Control":"no-store"}}); }
}

export async function POST(request:Request) {
  try {
    const me = await account(); if (!me) return Response.json({error:"Không có quyền"},{status:403});
    const payload = await request.json() as Record<string,unknown>;
    const db = getDb();
    if (payload.action === "saveScript") {
      const name = String(payload.name || "").trim().slice(0,80);
      const source = String(payload.source || "").trim();
      if (!name || !source || source.length>10000) return Response.json({error:"Tên hoặc mã chỉ báo không hợp lệ."},{status:400});
      const id = typeof payload.id === "string" ? payload.id : crypto.randomUUID();
      const existing = await db.select().from(indicators).where(eq(indicators.id,id)).get();
      if (existing && existing.ownerId!==me.id) return Response.json({error:"Không có quyền sửa."},{status:403});
      if (existing) await db.update(indicators).set({name,source,updatedAt:Date.now()}).where(and(eq(indicators.id,id),eq(indicators.ownerId,me.id)));
      else await db.insert(indicators).values({id,ownerId:me.id,name,source,createdAt:Date.now(),updatedAt:Date.now()});
      return Response.json({id});
    }
    if (payload.action === "deleteScript") {
      if (typeof payload.id!=="string") return Response.json({error:"ID không hợp lệ"},{status:400});
      await db.delete(indicators).where(and(eq(indicators.id,payload.id),eq(indicators.ownerId,me.id)));
      return Response.json({ok:true});
    }
    if (payload.action === "saveSettings") {
      const market = payload.market === "futures" ? "futures" : "spot";
      const symbol = String(payload.symbol||"BTCUSDT").toUpperCase();
      const interval = String(payload.interval||"1h");
      const enabled = JSON.stringify(payload.enabled||{});
      if (enabled.length>4000 || !/^[A-Z0-9]{5,20}$/.test(symbol) || !/^(1m|3m|5m|15m|30m|1h|2h|4h|6h|8h|12h|1d|3d|1w|1M)$/.test(interval)) return Response.json({error:"Cấu hình không hợp lệ"},{status:400});
      await db.insert(settings).values({userId:me.id,market,symbol,interval,enabled}).onConflictDoUpdate({target:settings.userId,set:{market,symbol,interval,enabled}});
      return Response.json({ok:true});
    }
    if (payload.action === "invite" && me.role === "admin") {
      const email = String(payload.email||"").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length>254) return Response.json({error:"Email không hợp lệ"},{status:400});
      await db.insert(invitations).values({email,createdAt:Date.now()}).onConflictDoNothing();
      return Response.json({ok:true});
    }
    if (payload.action === "revoke" && me.role === "admin") {
      const email=String(payload.email||"").toLowerCase();
      await db.delete(invitations).where(eq(invitations.email,email));
      return Response.json({ok:true});
    }
    return Response.json({error:"Thao tác không hợp lệ"},{status:400});
  } catch { return Response.json({error:"Không lưu được dữ liệu. Vui lòng thử lại."},{status:503}); }
}
