import {spawnSync} from "node:child_process";
import {mkdirSync} from "node:fs";
import {createRequire} from "node:module";
const esbuild=createRequire(import.meta.resolve("drizzle-kit"))("esbuild");
mkdirSync(".sites-runtime/tests",{recursive:true});
await esbuild.build({entryPoints:["tests/pine.test.ts"],bundle:true,platform:"node",format:"cjs",outfile:".sites-runtime/tests/pine.cjs",logLevel:"silent"});
for(const file of [".sites-runtime/tests/pine.cjs","tests/account.test.mjs"]){const r=spawnSync(process.execPath,[file],{stdio:"inherit"});if(r.status!==0)process.exit(r.status||1);}
