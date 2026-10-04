import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync,readdirSync,mkdirSync } from "node:fs";
import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const esbuild=createRequire(import.meta.resolve("drizzle-kit"))("esbuild");
const sqlite=new DatabaseSync(":memory:");
for(const file of readdirSync("drizzle").filter(x=>x.endsWith(".sql")).sort())sqlite.exec(readFileSync(`drizzle/${file}`,"utf8"));
class Statement {
  constructor(sql,args=[]){this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.sql,args);}
  async first(){return sqlite.prepare(this.sql).get(...this.args)||null;}
  async raw(){const q=sqlite.prepare(this.sql);q.setReturnArrays(true);return q.all(...this.args);}
  async all(){return{results:sqlite.prepare(this.sql).all(...this.args),success:true,meta:{}};}
  async run(){const r=sqlite.prepare(this.sql).run(...this.args);return{success:true,results:[],meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
}
const DB={prepare:sql=>new Statement(sql),batch:async queries=>{sqlite.exec("BEGIN");try{const result=[];for(const q of queries)result.push(await q.run());sqlite.exec("COMMIT");return result;}catch(error){sqlite.exec("ROLLBACK");throw error;}}};
const env={DB,APP_ORIGIN:"https://chart.example",MAIL_FROM:"Chart Lab <test@example.test>",RESEND_API_KEY:"unit-test-placeholder"};
globalThis.__chartTest={env,cookie:""};
mkdirSync(".sites-runtime/tests",{recursive:true});
await esbuild.build({entryPoints:["app/api/account/route.ts","app/api/account/recovery/route.ts","lib/local-auth.ts"],outdir:".sites-runtime/tests",outbase:".",outExtension:{".js":".cjs"},platform:"node",format:"cjs",bundle:true,logLevel:"silent",plugins:[{name:"test-bindings",setup(build){build.onResolve({filter:/^(cloudflare:workers|next\/headers)$/},args=>({path:args.path,namespace:"test"}));build.onLoad({filter:/.*/,namespace:"test"},args=>({contents:args.path==="cloudflare:workers"?'export const env=globalThis.__chartTest.env;':'export async function cookies(){return{get(name){const value=globalThis.__chartTest.cookie.match(new RegExp("(?:^|;\\\\s*)"+name+"=([^;]+)"))?.[1];return value?{value}:undefined;}}}',loader:"js"}));}}]});
const account=require("../.sites-runtime/tests/app/api/account/route.cjs");const recovery=require("../.sites-runtime/tests/app/api/account/recovery/route.cjs");const auth=require("../.sites-runtime/tests/lib/local-auth.cjs");
const mails=[];const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{assert.equal(url,"https://api.resend.com/emails");mails.push(JSON.parse(options.body));return Response.json({id:"test"});};
let seq=0;
async function call(handler,body,{cookie="",ip=`test-${++seq}`,origin="https://chart.example"}={}){globalThis.__chartTest.cookie=cookie;return handler.POST(new Request("https://chart.example/api/account",{method:"POST",headers:{"Content-Type":"application/json",Origin:origin,"CF-Connecting-IP":ip,cookie},body:JSON.stringify(body)}));}
const password="test-only-password-12345",username="test_member";
const registered=await call(account,{action:"register",username,password,remember:false});assert.equal(registered.status,200);const session=registered.headers.get("set-cookie");assert.ok(session.includes("HttpOnly")&&session.includes("SameSite=Lax")&&session.includes("Secure"));assert.ok(!session.includes("Max-Age"));const cookie=session.split(";")[0];
const logged=await call(account,{action:"login",username,password,remember:true});assert.equal(logged.status,200);assert.match(logged.headers.get("set-cookie"),/Max-Age=2592000/);
assert.equal((await call(recovery,{action:"link",email:"me@example.test",password:"wrong-password-123"},{cookie})).status,401);
assert.equal((await call(recovery,{action:"link",email:"me@example.test",password},{cookie})).status,200);assert.equal(mails.length,1);
const tokenOf=mail=>mail.text.match(/#token=([A-Za-z0-9_-]+)/)[1];const verifyToken=tokenOf(mails[0]);
assert.equal(sqlite.prepare("SELECT token_hash FROM account_tokens").get().token_hash,await auth.sha256(verifyToken));assert.notEqual(sqlite.prepare("SELECT token_hash FROM account_tokens").get().token_hash,verifyToken);
assert.equal((await call(recovery,{action:"verify",token:verifyToken})).status,200);assert.equal((await call(recovery,{action:"verify",token:verifyToken})).status,400);
const known=await call(recovery,{action:"forgot",email:"me@example.test"});const unknown=await call(recovery,{action:"forgot",email:"missing@example.test"});assert.deepEqual(await known.json(),await unknown.json());
const resetToken=tokenOf(mails.at(-1));assert.equal((await call(recovery,{action:"reset",token:resetToken,password:"short"})).status,400);assert.ok(sqlite.prepare("SELECT count(*) AS n FROM login_sessions").get().n>0);
const reset=await call(recovery,{action:"reset",token:resetToken,password:"new-test-password-12345"});assert.equal(reset.status,200);assert.equal(sqlite.prepare("SELECT count(*) AS n FROM login_sessions").get().n,0);assert.equal((await call(recovery,{action:"reset",token:resetToken,password})).status,400);
assert.equal((await call(account,{action:"login",username,password})).status,401);assert.equal((await call(account,{action:"login",username,password:"new-test-password-12345"})).status,200);
assert.equal((await call(recovery,{action:"forgot",email:"me@example.test"},{origin:"https://other.example"})).status,403);
await call(recovery,{action:"forgot",email:"me@example.test"});const expired=tokenOf(mails.at(-1));sqlite.prepare("UPDATE account_tokens SET expires_at=0").run();assert.equal((await call(recovery,{action:"reset",token:expired,password})).status,400);
for(let i=0;i<15;i++)await call(recovery,{action:"forgot",email:"absent@example.test"},{ip:"rate-limit-test"});assert.equal((await call(recovery,{action:"forgot",email:"absent@example.test"},{ip:"rate-limit-test"})).status,429);
delete env.RESEND_API_KEY;assert.equal((await call(recovery,{action:"forgot",email:"me@example.test"})).status,503);
globalThis.fetch=originalFetch;sqlite.close();console.log("Accounts: registration/login, session persistence, password confirmation, email verification, hashed tokens, expiry/replay, reset/session revocation, CSRF, rate limit and missing-provider checks passed (mail transport mocked)");
