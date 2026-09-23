export type Bar = {time:number;open:number;high:number;low:number;close:number;volume:number};
type Field = "open"|"high"|"low"|"close"|"volume";
export type Formula = {kind:"sma"|"ema"|"rsi"|"stdev"|"field";field:Field;length:number;overlay:boolean};

export function parsePine(source:string):Formula {
  if (source.length > 10000) throw Error("Mã dài quá giới hạn 10.000 ký tự.");
  const lines=source.split(/\r?\n/).map(x=>x.trim()).filter(x=>x && !x.startsWith("//"));
  const vars:Record<string,number>={};
  let expression=""; let overlay=true;
  for (const line of lines) {
    if (/^indicator\s*\(/.test(line)) {
      if (/overlay\s*=\s*false/.test(line)) overlay=false;
      continue;
    }
    const variable=line.match(/^([a-zA-Z_]\w*)\s*=\s*input\.(?:int|float)\(\s*(\d{1,3})(?:\s*,[^)]*)?\)$/);
    if (variable) {vars[variable[1]]=Number(variable[2]);continue;}
    const plotted=line.match(/^plot\s*\(\s*(.+?)\s*(?:,\s*(?:title|color|linewidth|style)\s*=.+)?\)$/);
    if (plotted && !expression) {expression=plotted[1];continue;}
    throw Error(`Chưa hỗ trợ dòng: ${line.slice(0,100)}`);
  }
  if (!expression) throw Error("Cần một lệnh plot(...).");
  if (/^(open|high|low|close|volume)$/.test(expression)) return {kind:"field",field:expression as Field,length:1,overlay};
  const fn=expression.match(/^ta\.(sma|ema|rsi|stdev)\(\s*(open|high|low|close|volume)\s*,\s*(\d{1,3}|[a-zA-Z_]\w*)\s*\)$/);
  if (!fn) throw Error("Chỉ hỗ trợ plot(ta.sma/ema/rsi/stdev(close, độ_dài)) hoặc plot(close).");
  const length=/^\d+$/.test(fn[3])?Number(fn[3]):vars[fn[3]];
  if (!Number.isInteger(length)||length<2||length>200) throw Error("Độ dài cần là số nguyên từ 2 đến 200; input.int phải được khai báo.");
  return {kind:fn[1] as Formula["kind"],field:fn[2] as Field,length,overlay:fn[1]==="rsi"?false:overlay};
}

export function values(bars:Bar[], formula:Formula):Array<number|null> {
  const a=bars.map(b=>b[formula.field]); const n=formula.length;
  if(formula.kind==="field") return a;
  const result:Array<number|null>=Array(a.length).fill(null);
  if (a.length<n) return result;
  if(formula.kind==="ema") {
    let v=a.slice(0,n).reduce((x,y)=>x+y,0)/n;result[n-1]=v;
    for(let i=n;i<a.length;i++){v=(a[i]-v)*(2/(n+1))+v;result[i]=v;} return result;
  }
  if(formula.kind==="rsi") {
    if(a.length<=n) return result;
    let gain=0,loss=0;
    for(let i=1;i<=n;i++){const d=a[i]-a[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}
    gain/=n;loss/=n;result[n]=loss===0?100:100-100/(1+gain/loss);
    for(let i=n+1;i<a.length;i++){const d=a[i]-a[i-1];gain=(gain*(n-1)+Math.max(d,0))/n;loss=(loss*(n-1)+Math.max(-d,0))/n;result[i]=loss===0?100:100-100/(1+gain/loss);} return result;
  }
  for(let i=n-1;i<a.length;i++){
    const chunk=a.slice(i-n+1,i+1);const mean=chunk.reduce((x,y)=>x+y,0)/n;
    result[i]=formula.kind==="sma"?mean:Math.sqrt(chunk.reduce((x,y)=>x+(y-mean)**2,0)/n);
  }return result;
}

export function bands(bars:Bar[],length=20,multiplier=2){
  const mean=values(bars,{kind:"sma",field:"close",length,overlay:true});
  const sd=values(bars,{kind:"stdev",field:"close",length,overlay:true});
  return {middle:mean,upper:mean.map((v,i)=>v===null||sd[i]===null?null:v+multiplier*sd[i]!),lower:mean.map((v,i)=>v===null||sd[i]===null?null:v-multiplier*sd[i]!)};
}
