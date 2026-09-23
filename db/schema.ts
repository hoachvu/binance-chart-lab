import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull().default("member"),
  createdAt: integer("created_at").notNull(),
});
export const invitations = sqliteTable("invitations", {
  email: text("email").primaryKey(),
  createdAt: integer("created_at").notNull(),
});
export const indicators = sqliteTable("indicators", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  source: text("source").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
export const settings = sqliteTable("settings", {
  userId: text("user_id").primaryKey().references(() => users.id),
  market: text("market").notNull().default("spot"),
  symbol: text("symbol").notNull().default("BTCUSDT"),
  interval: text("interval").notNull().default("1h"),
  enabled: text("enabled").notNull().default("{}"),
  watchlist: text("watchlist").notNull().default("[]"),
});

export const localAccounts = sqliteTable("local_accounts", {
  username: text("username").primaryKey(),
  userId: text("user_id").notNull().unique().references(() => users.id),
  passwordHash: text("password_hash").notNull(),
  salt: text("salt").notNull(),
  iterations: integer("iterations").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const loginSessions = sqliteTable("login_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  expiresAt: integer("expires_at").notNull(),
});

export const authAttempts = sqliteTable("auth_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull(),
  resetAt: integer("reset_at").notNull(),
});
