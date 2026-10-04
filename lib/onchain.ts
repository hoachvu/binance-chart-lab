import type { OnchainData, OnchainRow } from "./pine";
type Chart={status:string;values:{x:number;y:number}[]};
type Counts={data:{time:string;BlkCnt:string}[];next_page_url?:string};
export function mergeOnchain(difficulty:Chart,fees:Chart,price:Chart,counts:Counts):OnchainData {
  for(const series of [difficulty,fees,price])if(series.status!=="ok"||!Array.isArray(series.values))throw Error("Nguồn dữ liệu on-chain không khả dụng.");
  if(!Array.isArray(counts.data)||counts.next_page_url||counts.data[0]?.time.slice(0,10)!=="2009-01-03")throw Error("Thiếu lịch sử block để xác định halving.");
  const map=(c:Chart)=>new Map(c.values.map(x=>[Math.floor(x.x/86400)*86400,x.y]));
  const d=map(difficulty),f=map(fees),p=map(price),today=Math.floor(Date.now()/86400000)*86400;
  const rows:OnchainRow[]=[];let height=0,previous=0;
  for(const item of counts.data){const time=Date.parse(item.time)/1000,blocks=Number(item.BlkCnt);if(!Number.isFinite(time)||!Number.isInteger(blocks)||blocks<0||previous&&time!==previous+86400)throw Error("Lịch sử block thiếu ngày hoặc không hợp lệ.");previous=time;height+=blocks;
    const difficulty=d.get(time),feesUsd=f.get(time),priceUsd=p.get(time);
    if(time>=today||difficulty===undefined||feesUsd===undefined||priceUsd===undefined)continue;
    if(![difficulty,feesUsd,priceUsd].every(Number.isFinite)||difficulty<=0||feesUsd<0||priceUsd<=0||blocks===0)continue;
    rows.push({time,difficulty,feesUsd,priceUsd,blocks,height});
  }
  if(rows.length<95)throw Error("Chưa đủ dữ liệu cho đường trung bình 90 ngày.");
  return{rows,updatedAt:new Date().toISOString(),sources:["Blockchain.com: difficulty, transaction-fees-usd, market-price","Coin Metrics Community: BlkCnt; block height = cumulative BlkCnt (genesis height 0)"]};
}
