export const runtime="edge";
type Pair={symbol:string;baseAsset:string;quoteAsset:string};
const cache=new Map<string,{until:number;pairs:Pair[]}>();
export async function GET(request:Request){
  const market=new URL(request.url).searchParams.get("market")==="futures"?"futures":"spot";
  const cached=cache.get(market);
  if(cached&&cached.until>Date.now())return Response.json({pairs:cached.pairs},{headers:{"Cache-Control":"public, max-age=300"}});
  const url=market==="spot"?"https://data-api.binance.vision/api/v3/exchangeInfo":"https://fapi.binance.com/fapi/v1/exchangeInfo";
  try{
    const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error("Binance unavailable");
    const data=await response.json() as {symbols?:Array<{symbol:string;baseAsset:string;quoteAsset:string;status:string;contractType?:string}>};
    if(!Array.isArray(data.symbols))throw Error("Invalid exchange information");
    const pairs=data.symbols.filter(p=>p.status==="TRADING"&&(!p.contractType||p.contractType==="PERPETUAL")&&p.symbol&&p.baseAsset&&p.quoteAsset).map(({symbol,baseAsset,quoteAsset})=>({symbol,baseAsset,quoteAsset}));
    cache.set(market,{until:Date.now()+300000,pairs});
    return Response.json({pairs},{headers:{"Cache-Control":"public, max-age=300"}});
  }catch{return Response.json({error:"Không tải được danh sách cặp Binance"},{status:503})}
}
