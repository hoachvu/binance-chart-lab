export type Bar = {time:number;open:number;high:number;low:number;close:number;volume:number};
export type PriceField = "open"|"high"|"low"|"close"|"hl2"|"hlc3"|"ohlc4";
type Field = PriceField|"volume";
export type IndicatorSettings = {
  ma:{period:number;source:PriceField;method:"sma"|"ema";color:string;width:1|2|3|4};
  bb:{period:number;source:PriceField;method:"sma"|"ema";deviation:number;upperColor:string;basisColor:string;lowerColor:string;fillColor:string;fillOpacity:number;width:1|2|3|4};
  rsi:{period:number;source:PriceField;color:string;width:1|2|3|4;overbought:number;oversold:number;overboughtColor:string;oversoldColor:string;midColor:string;backgroundColor:string;backgroundOpacity:number};
  volume:{upColor:string;downColor:string};
};
export const DEFAULT_INDICATOR_SETTINGS:IndicatorSettings={
  ma:{period:20,source:"close",method:"sma",color:"#ffcc73",width:2},
  bb:{period:20,source:"close",method:"sma",deviation:2,upperColor:"#b589ff",basisColor:"#ffcc73",lowerColor:"#72a7ff",fillColor:"#8f7af8",fillOpacity:12,width:1},
  rsi:{period:14,source:"close",color:"#7daaff",width:2,overbought:70,oversold:30,overboughtColor:"#ef7d88",oversoldColor:"#50c7a6",midColor:"#7f91a6",backgroundColor:"#5577aa",backgroundOpacity:7},
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
  const legacyBb=color(bb.color,d.bb.basisColor);
  return {
    ma:{period:Math.round(num(ma.period,d.ma.period,2,500)),source:source(ma.source,d.ma.source),method:method(ma.method,d.ma.method),color:color(ma.color,d.ma.color),width:width(ma.width,d.ma.width)},
    bb:{period:Math.round(num(bb.period,d.bb.period,2,500)),source:source(bb.source,d.bb.source),method:method(bb.method,d.bb.method),deviation:num(bb.deviation,d.bb.deviation,.1,10),upperColor:color(bb.upperColor,legacyBb),basisColor:color(bb.basisColor,legacyBb),lowerColor:color(bb.lowerColor,legacyBb),fillColor:color(bb.fillColor,d.bb.fillColor),fillOpacity:Math.round(num(bb.fillOpacity,d.bb.fillOpacity,0,40)),width:width(bb.width,d.bb.width)},
    rsi:{period:Math.round(num(rsi.period,d.rsi.period,2,200)),source:source(rsi.source,d.rsi.source),color:color(rsi.color,d.rsi.color),width:width(rsi.width,d.rsi.width),overbought,oversold,overboughtColor:color(rsi.overboughtColor,d.rsi.overboughtColor),oversoldColor:color(rsi.oversoldColor,d.rsi.oversoldColor),midColor:color(rsi.midColor,d.rsi.midColor),backgroundColor:color(rsi.backgroundColor,d.rsi.backgroundColor),backgroundOpacity:Math.round(num(rsi.backgroundOpacity,d.rsi.backgroundOpacity,0,30))},
    volume:{upColor:color(volume.upColor,d.volume.upColor),downColor:color(volume.downColor,d.volume.downColor)},
  };
}
function fieldValue(b:Bar,field:Field){
  if(field==="hl2")return (b.high+b.low)/2;
  if(field==="hlc3")return (b.high+b.low+b.close)/3;
  if(field==="ohlc4")return (b.open+b.high+b.low+b.close)/4;
  return b[field];
}
export type PlotFormula = {id:string;title:string;color:string;width:1|2|3|4;kind:"sma"|"ema"|"rsi"|"stdev"|"field";field:Field;length:number};
export type Formula = {overlay:boolean;plots:PlotFormula[]};

const PLOT_COLORS=["#e8a0e6","#6edbc4","#ffcc73","#7daaff","#f18f7e","#b589ff","#66b8ff","#d7df72"];
const NAMED_COLORS:Record<string,string>={red:"#f26972",green:"#28c4a6",blue:"#7daaff",orange:"#ffad66",purple:"#b589ff",yellow:"#ffcc73",aqua:"#55d8d0",fuchsia:"#e8a0e6",white:"#ffffff",gray:"#8c9bac"};

function splitArguments(value:string){
  const result:string[]=[];let current="";let depth=0;let quote="";
  for(const char of value){
    if((char==='"'||char==="'")&&!quote)quote=char;else if(char===quote)quote="";
    if(!quote){if(char==="(")depth++;else if(char===")")depth--;else if(char===","&&depth===0){result.push(current.trim());current="";continue;}}
    current+=char;
  }
  if(current.trim())result.push(current.trim());return result;
}

function parsePlotExpression(expression:string,vars:Record<string,number>,meta:{id:string;title:string;color:string;width:1|2|3|4}):PlotFormula{
  if (/^(open|high|low|close|volume)$/.test(expression)) return {...meta,kind:"field",field:expression as Field,length:1};
  const fn=expression.match(/^ta\.(sma|ema|rsi|stdev)\(\s*(open|high|low|close|volume)\s*,\s*(\d{1,3}|[a-zA-Z_]\w*)\s*\)$/);
  if (!fn) throw Error("Chỉ hỗ trợ plot(ta.sma/ema/rsi/stdev(close, độ_dài)) hoặc plot(close).");
  const length=/^\d+$/.test(fn[3])?Number(fn[3]):vars[fn[3]];
  if (!Number.isInteger(length)||length<2||length>200) throw Error("Độ dài cần là số nguyên từ 2 đến 200; input.int phải được khai báo.");
  return {...meta,kind:fn[1] as PlotFormula["kind"],field:fn[2] as Field,length};
}

export function parsePine(source:string):Formula {
  if (source.length > 10000) throw Error("Mã dài quá giới hạn 10.000 ký tự.");
  const lines=source.split(/\r?\n/).map(x=>x.trim()).filter(x=>x && !x.startsWith("//"));
  const vars:Record<string,number>={};
  const plots:PlotFormula[]=[];let overlay=true;
  for (const line of lines) {
    if (/^indicator\s*\(/.test(line)) {
      if (/overlay\s*=\s*false/.test(line)) overlay=false;
      continue;
    }
    const variable=line.match(/^([a-zA-Z_]\w*)\s*=\s*input\.(?:int|float)\(\s*(\d{1,3})(?:\s*,[^)]*)?\)$/);
    if (variable) {vars[variable[1]]=Number(variable[2]);continue;}
    const plotted=line.match(/^plot\s*\((.*)\)$/);
    if (plotted) {
      if(plots.length>=8)throw Error("Mỗi chỉ báo hỗ trợ tối đa 8 lệnh plot().");
      const args=splitArguments(plotted[1]);const expression=args.shift()?.trim();
      if(!expression)throw Error("Lệnh plot() đang thiếu biểu thức.");
      const options=Object.fromEntries(args.flatMap(arg=>{const match=arg.match(/^(title|color|linewidth)\s*=\s*(.+)$/);return match?[[match[1],match[2].trim()]]:[]}));
      const title=String(options.title||"").replace(/^["']|["']$/g,"")||`Đường ${plots.length+1}`;
      const rawColor=String(options.color||"").replace(/^["']|["']$/g,"");
      const named=rawColor.match(/^color\.([a-z]+)$/)?.[1];
      const color=/^#[0-9a-f]{6}$/i.test(rawColor)?rawColor:NAMED_COLORS[named||""]||PLOT_COLORS[plots.length%PLOT_COLORS.length];
      const rawWidth=Number(options.linewidth);const width=(Number.isInteger(rawWidth)&&rawWidth>=1&&rawWidth<=4?rawWidth:2) as 1|2|3|4;
      plots.push(parsePlotExpression(expression,vars,{id:`plot-${plots.length+1}`,title,color,width}));continue;
    }
    throw Error(`Chưa hỗ trợ dòng: ${line.slice(0,100)}`);
  }
  if (!plots.length) throw Error("Cần ít nhất một lệnh plot(...).");
  return {plots,overlay:plots.some(plot=>plot.kind==="rsi")?false:overlay};
}

export function setPinePlotColor(source:string,index:number,color:string){
  let seen=0;
  return source.split(/\r?\n/).map(line=>{
    const match=line.match(/^(\s*)plot\s*\((.*)\)\s*$/);if(!match)return line;
    if(seen++!==index)return line;
    const args=splitArguments(match[2]).filter((arg,i)=>i===0||!/^color\s*=/.test(arg));
    args.push(`color="${color}"`);return `${match[1]}plot(${args.join(", ")})`;
  }).join("\n");
}

export function values(bars:Bar[], formula:PlotFormula|Omit<PlotFormula,"id"|"title"|"color"|"width">):Array<number|null> {
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
  const mean=values(bars,{kind:method,field,length});
  const sd=values(bars,{kind:"stdev",field,length});
  return {middle:mean,upper:mean.map((v,i)=>v===null||sd[i]===null?null:v+multiplier*sd[i]!),lower:mean.map((v,i)=>v===null||sd[i]===null?null:v-multiplier*sd[i]!)};
}
