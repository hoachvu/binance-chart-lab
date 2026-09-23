export type Bar = {time:number;open:number;high:number;low:number;close:number;volume:number};
export type PriceField = "open"|"high"|"low"|"close"|"hl2"|"hlc3"|"ohlc4";
type Field = PriceField|"volume";
export type IndicatorSettings = {
  ma:{period:number;source:PriceField;method:"sma"|"ema";color:string;width:1|2|3|4};
  bb:{period:number;source:PriceField;method:"sma"|"ema";deviation:number;color:string;width:1|2|3|4};
  rsi:{period:number;source:PriceField;color:string;width:1|2|3|4;overbought:number;oversold:number};
  volume:{upColor:string;downColor:string};
};
export const DEFAULT_INDICATOR_SETTINGS:IndicatorSettings={
  ma:{period:20,source:"close",method:"sma",color:"#ffcc73",width:2},
  bb:{period:20,source:"close",method:"sma",deviation:2,color:"#ad8ef8",width:1},
  rsi:{period:14,source:"close",color:"#7daaff",width:2,overbought:70,oversold:30},
  volume:{upColor:"#249e8c",downColor:"#d15b67"},
};
export function normalizeIndicatorSettings(raw:unknown):IndicatorSettings {
  const o=raw && typeof raw==="object"?raw as Record<string,unknown>:{};
  const part=(key:string)=>o[key] && typeof o[key]==="object"?o[key] as Record<string,unknown>:{};
  const num=(v:unknown,fallback:number,min:number,max:number)=>typeof v==="number"&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
  const color=(v:unknown,fallback:string)=>typeof v==="string"&&/^#[0-9a-f]{6}$/i.test(v)?v:fallback;
  const source=(v:unknown,fallback:PriceField):PriceField=>["open","high","low","close","hl2","hlc3","ohlc4"].includes(String(v))?v as PriceField:fallback;
  const method=(v:unknown,fallback:"sma"|"ema")=>v==="sma"||v==="ema"?v:fallback;
  const width=(v:unknown,fallback:1|2|3|4)=>Math.round(num(v,fallback,1,4)) as 1|2|3|4;
  const ma=part("ma"),bb=part("bb"),rsi=part("rsi"),volume=part("volume"),d=DEFAULT_INDICATOR_SETTINGS;
  const overbought=Math.round(num(rsi.overbought,d.rsi.overbought,2,99));
  const oversold=Math.min(overbought-1,Math.round(num(rsi.oversold,d.rsi.oversold,1,98)));
  return {
    ma:{period:Math.round(num(ma.period,d.ma.period,2,500)),source:source(ma.source,d.ma.source),method:method(ma.method,d.ma.method),color:color(ma.color,d.ma.color),width:width(ma.width,d.ma.width)},
    bb:{period:Math.round(num(bb.period,d.bb.period,2,500)),source:source(bb.source,d.bb.source),method:method(bb.method,d.bb.method),deviation:num(bb.deviation,d.bb.deviation,.1,10),color:color(bb.color,d.bb.color),width:width(bb.width,d.bb.width)},
    rsi:{period:Math.round(num(rsi.period,d.rsi.period,2,200)),source:source(rsi.source,d.rsi.source),color:color(rsi.color,d.rsi.color),width:width(rsi.width,d.rsi.width),overbought,oversold},
    volume:{upColor:color(volume.upColor,d.volume.upColor),downColor:color(volume.downColor,d.volume.downColor)},
  };
}
function fieldValue(b:Bar,field:Field){
  if(field==="hl2")return (b.high+b.low)/2;
  if(field==="hlc3")return (b.high+b.low+b.close)/3;
  if(field==="ohlc4")return (b.open+b.high+b.low+b.close)/4;
  return b[field];
}
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
  const a=bars.map(b=>fieldValue(b,formula.field)); const n=formula.length;
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

export function bands(bars:Bar[],length=20,multiplier=2,field:PriceField="close",method:"sma"|"ema"="sma"){
  const mean=values(bars,{kind:method,field,length,overlay:true});
  const sd=values(bars,{kind:"stdev",field,length,overlay:true});
  return {middle:mean,upper:mean.map((v,i)=>v===null||sd[i]===null?null:v+multiplier*sd[i]!),lower:mean.map((v,i)=>v===null||sd[i]===null?null:v-multiplier*sd[i]!)};
}
