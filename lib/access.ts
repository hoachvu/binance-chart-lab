import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { users, invitations } from "@/db/schema";

export async function account() {
  const user = await getChatGPTUser();
  if (!user) return null;
  const db = getDb();
  let row = await db.select().from(users).where(eq(users.id, user.userId)).get();
  if (row?.role === "member") {
    const invite = await db.select().from(invitations).where(eq(invitations.email, user.email.toLowerCase())).get();
    if (!invite) return null;
  }
  if (!row) {
    // The first visitor on an owner-private deployment claims administration.
    const owner = await db.select().from(users).where(eq(users.role, "admin")).get();
    if (!owner && user.email.toLowerCase() === "vuhoach.idc@gmail.com") {
      await db.insert(users).values({ id: user.userId, email: user.email.toLowerCase(), role: "admin", createdAt: Date.now() }).onConflictDoNothing();
    } else {
      const invite = await db.select().from(invitations).where(eq(invitations.email, user.email.toLowerCase())).get();
      if (!invite) return null;
      await db.insert(users).values({ id: user.userId, email: user.email.toLowerCase(), role: "member", createdAt: Date.now() }).onConflictDoNothing();
    }
    row = await db.select().from(users).where(eq(users.id, user.userId)).get();
  }
  return row ? { ...row, displayName: user.displayName } : null;
}
