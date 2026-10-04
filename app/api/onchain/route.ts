import { mergeOnchain } from "@/lib/onchain";
import type { OnchainData } from "@/lib/pine";
let cached:{expires:number;data:OnchainData}|null=null;let pending:Promise<OnchainData>|null=null;
async function getData(){
  const urls=["difficulty","transaction-fees-usd","market-price"].map(name=>`https://api.blockchain.info/charts/${name}?timespan=2years&format=json&sampled=false`);
  urls.push("https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=BlkCnt&frequency=1d&page_size=10000&start_time=2009-01-03");
  const data=await Promise.all(urls.map(async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error("On-chain provider unavailable");return r.json();}));
  return mergeOnchain(data[0] as Parameters<typeof mergeOnchain>[0],data[1] as Parameters<typeof mergeOnchain>[1],data[2] as Parameters<typeof mergeOnchain>[2],data[3] as Parameters<typeof mergeOnchain>[3]);
}
export async function GET(){try{if(!cached||cached.expires<Date.now()){pending??=getData();try{cached={data:await pending,expires:Date.now()+3600000};}finally{pending=null;}}return Response.json(cached.data,{headers:{"Cache-Control":"public, max-age=300, s-maxage=3600"}});}catch{return Response.json({error:"Chưa tải được dữ liệu on-chain từ Blockchain.com / Coin Metrics. Không dùng dữ liệu giả; hãy thử lại."},{status:503,headers:{"Cache-Control":"no-store"}});}}
