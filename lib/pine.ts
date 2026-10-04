import { values, type Bar } from "./indicators";
export type Expr={type:"literal";value:number|string|boolean|null}|{type:"name";name:string}|{type:"call";name:string;args:Expr[];options:Record<string,Expr>}|{type:"binary";op:string;left:Expr;right:Expr}|{type:"unary";op:string;value:Expr}|{type:"ternary";test:Expr;yes:Expr;no:Expr};
type Statement={name:string|null;expression:Expr;line:number};
export type PinePlot={id:string;title:string;color:string;opacity:number;width:1|2|3|4;kind:"expression";field:"close";length:1;expression:Expr;line:number;statement:number};
export type Formula={overlay:boolean;plots:PinePlot[];statements:Statement[];fills:{first:number;second:number;color:string;opacity:number;line:number}[];requests:string[];priceDependent:boolean;inputs:{name:string;title:string;kind:"bool"|"int"|"float";value:number|boolean;statement:number;min?:number;max?:number;step?:number}[];source:string};
export type OnchainRow={time:number;difficulty:number;feesUsd:number;priceUsd:number;blocks:number;height:number};
export type OnchainData={rows:OnchainRow[];updatedAt:string;sources:string[]};
const COLORS:Record<string,string>={purple:"#9c27b0",yellow:"#ffeb3b",red:"#f23645",green:"#4caf50",blue:"#2196f3",orange:"#ff9800",aqua:"#00bcd4",fuchsia:"#e040fb",white:"#ffffff",gray:"#787b86",black:"#000000",lime:"#00e676",navy:"#311b92",teal:"#00897b",silver:"#b2b5be",maroon:"#880e4f",olive:"#808000"};
export const EXTERNAL_SYMBOLS:Record<string,keyof OnchainRow>={"GLASSNODE:BTC_DIFFICULTY":"difficulty","COINMETRICS:BTC_FEEUSD":"feesUsd","INDEX:BTCUSD":"priceUsd","GLASSNODE:BTC_BLOCKS":"height","GLASSNODE:BTC_BLOCKSMINED":"blocks"};
const CALLS=new Set(["indicator","input.int","input.float","input.bool","math.floor","math.round","math.max","math.min","math.pow","math.abs","math.sqrt","int","float","ta.sma","ta.ema","ta.rsi","ta.stdev","request.security","timeframe.in_seconds","plot","fill","color.new"]);
const BASE=new Set(["open","high","low","close","volume","hl2","hlc3","ohlc4","na","true","false","timeframe.period","barmerge.gaps_off","barmerge.lookahead_off",...Object.keys(COLORS).map(x=>`color.${x}`)]);
export function cleanPine(source:string){return source.split(/\r?\n/).map(line=>{const trim=line.trim();return trim.startsWith("**")&&trim.endsWith("**")?trim.slice(2,-2):line;}).join("\n").replace(/&#(?:xA0|160);|&nbsp;|\u00a0/gi," ").replace(/\\\*/g,"*");}
function statements(source:string){
  const out:{text:string;line:number}[]=[];let text="",depth=0,start=1;
  source.split(/\r?\n/).forEach((raw,index)=>{
    let line="",quote="",escape=false;
    for(let i=0;i<raw.length;i++){const c=raw[i];if(!quote&&c==="/"&&raw[i+1]==="/")break;if(escape){escape=false;line+=c;continue;}if(c==="\\"&&quote){escape=true;line+=c;continue;}if(c==='"'||c==="'"){if(quote===c)quote="";else if(!quote)quote=c;}if(!quote){if(c==="(")depth++;if(c===")")depth--;}line+=c;}
    if(!text&&line.trim())start=index+1;if(line.trim())text+=(text?" ":"")+line.trim();
    if(depth<0)throw Error(`Dòng ${index+1}: thừa dấu ).`);
    if(!depth&&text){out.push({text,line:start});text="";}
  });
  if(depth||text)throw Error(`Dòng ${start}: thiếu dấu đóng ngoặc.`);return out;
}
type Token={value:string;kind:"string"|"number"|"name"|"symbol"};
function parseExpression(text:string):Expr {
  const tokens:Token[]=[];let pos=0;
  while(pos<text.length){const rest=text.slice(pos);const ws=rest.match(/^\s+/);if(ws){pos+=ws[0].length;continue;}const str=rest.match(/^("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/);if(str){tokens.push({kind:"string",value:str[0].slice(1,-1).replace(/\\(["'\\])/g,"$1")});pos+=str[0].length;continue;}const num=rest.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);if(num){tokens.push({kind:"number",value:num[0]});pos+=num[0].length;continue;}const hex=rest.match(/^#[0-9a-f]{6}\b/i);if(hex){tokens.push({kind:"string",value:hex[0]});pos+=hex[0].length;continue;}const name=rest.match(/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/);if(name){tokens.push({kind:"name",value:name[0]});pos+=name[0].length;continue;}const op=rest.match(/^(?:>=|<=|==|!=|[+*/%?:(),=<>-])/);if(op){tokens.push({kind:"symbol",value:op[0]});pos+=op[0].length;continue;}throw Error(`Ký tự chưa hỗ trợ: ${rest.slice(0,18)}`);}
  let i=0;const peek=()=>tokens[i]?.value;const take=()=>{const t=tokens[i++];if(!t)throw Error("Biểu thức chưa hoàn chỉnh.");return t;};const expect=(v:string)=>{if(take().value!==v)throw Error(`Cần dấu ${v}.`);};
  const primary=():Expr=>{
    const t=take();if(t.value==="-"||t.value==="+"||t.value==="not")return{type:"unary",op:t.value,value:primary()};
    if(t.value==="("){const e=expression();expect(")");return e;}
    if(t.kind==="number")return{type:"literal",value:Number(t.value)};if(t.kind==="string")return{type:"literal",value:t.value};
    if(t.kind!=="name")throw Error("Cần giá trị hoặc tên biến.");
    if(peek()!=="(")return{type:"name",name:t.value};
    if(!CALLS.has(t.value))throw Error(`Chưa hỗ trợ hàm ${t.value}().`);take();const args:Expr[]=[],options:Record<string,Expr>={};
    while(peek()!==")"){if(!peek())throw Error("Thiếu dấu ).");if(tokens[i]?.kind==="name"&&tokens[i+1]?.value==="="){const key=take().value;take();if(Object.hasOwn(options,key))throw Error(`Tham số ${key} bị lặp.`);options[key]=expression();}else args.push(expression());if(peek()!==",")break;take();}
    expect(")");const accepted:Record<string,string[]>={indicator:["overlay","shorttitle"],plot:["title","color","linewidth"],fill:["color","title"],"input.bool":["title","group","tooltip"],"input.int":["title","group","tooltip","minval","maxval","step"],"input.float":["title","group","tooltip","minval","maxval","step"]};
    const arity:Record<string,[number,number]>={indicator:[1,2],plot:[1,4],fill:[2,3],"input.int":[1,2],"input.float":[1,2],"input.bool":[1,2],"math.floor":[1,1],"math.round":[1,1],"math.max":[2,8],"math.min":[2,8],"math.pow":[2,2],"math.abs":[1,1],"math.sqrt":[1,1],int:[1,1],float:[1,1],"ta.sma":[2,2],"ta.ema":[2,2],"ta.rsi":[2,2],"ta.stdev":[2,2],"request.security":[5,5],"timeframe.in_seconds":[0,1],"color.new":[2,2]};
    const range=arity[t.value];if(args.length<range[0]||args.length>range[1])throw Error(`${t.value}() cần ${range[0]===range[1]?range[0]:`${range[0]}–${range[1]}`} tham số vị trí.`);
    for(const key of Object.keys(options))if(!(accepted[t.value]||[]).includes(key))throw Error(`Chưa hỗ trợ ${t.value}(${key}=…).`);
    return{type:"call",name:t.value,args,options};
  };
  const precedence:Record<string,number>={or:1,and:2,"==":3,"!=":3,">":4,"<":4,">=":4,"<=":4,"+":5,"-":5,"*":6,"/":6,"%":6};
  const binary=(min=1):Expr=>{let left=primary();while((precedence[peek()||""]||0)>=min){const op=take().value;left={type:"binary",op,left,right:binary(precedence[op]+1)};}return left;};
  const expression=():Expr=>{const test=binary();if(peek()==="?"){take();const yes=expression();expect(":");return{type:"ternary",test,yes,no:expression()};}return test;};
  const result=expression();if(i!==tokens.length)throw Error(`Chưa hỗ trợ cú pháp: ${peek()}`);return result;
}
function literal(e:Expr|undefined):number|string|boolean|null {
  if(!e)return null;if(e.type==="literal")return e.value;if(e.type==="name"){if(e.name==="true")return true;if(e.name==="false")return false;if(e.name.startsWith("color."))return COLORS[e.name.slice(6)]||null;}throw Error("Tham số này cần giá trị cố định.");
}
function color(e:Expr|undefined,index=0):{color:string;opacity:number}{if(!e)return{color:["#e8a0e6","#6edbc4","#ffcc73","#7daaff"][index%4],opacity:1};if(e.type==="call"&&e.name==="color.new"){const base=color(e.args[0]);const transparency=Number(literal(e.args[1]));if(!Number.isFinite(transparency)||transparency<0||transparency>100)throw Error("Độ trong suốt cần 0–100.");return{color:base.color,opacity:1-transparency/100};}const value=literal(e);if(typeof value!=="string"||!/^#[0-9a-f]{6}$/i.test(value))throw Error("Màu cần color.purple… hoặc #RRGGBB.");return{color:value,opacity:1};}
function dependsOnPrices(e:Expr):boolean { if(e.type==="call"&&e.name==="request.security") return false; if(e.type==="name") return ["open","high","low","close","volume","hl2","hlc3","ohlc4"].includes(e.name); if(e.type==="call") return e.args.some(dependsOnPrices)||Object.values(e.options).some(dependsOnPrices); if(e.type==="binary") return dependsOnPrices(e.left)||dependsOnPrices(e.right); if(e.type==="ternary") return dependsOnPrices(e.test)||dependsOnPrices(e.yes)||dependsOnPrices(e.no); if(e.type==="unary") return dependsOnPrices(e.value); return false; }
function visit(e:Expr,callback:(e:Expr)=>void){callback(e);if(e.type==="binary"){visit(e.left,callback);visit(e.right,callback);}if(e.type==="unary")visit(e.value,callback);if(e.type==="ternary"){visit(e.test,callback);visit(e.yes,callback);visit(e.no,callback);}if(e.type==="call"){e.args.forEach(x=>visit(x,callback));Object.values(e.options).forEach(x=>visit(x,callback));}}
export function parsePine(raw:string):Formula {
  if(raw.length>10000)throw Error("Mã vượt giới hạn 10.000 ký tự.");const source=cleanPine(raw),known=new Set(BASE);const f:Formula={overlay:true,plots:[],statements:[],fills:[],requests:[],priceDependent:false,inputs:[],source};const handles=new Map<string,number>();
  for(const s of statements(source))try{
    const match=s.text.match(/^([A-Za-z_]\w*)\s*(:=|=)\s*(.+)$/);const name=match?.[1]||null;const text=match?.[3]||s.text;
    if(name&&BASE.has(name))throw Error("Không được ghi đè tên hệ thống.");if(match?.[2]===":="&&!known.has(name!))throw Error(`Biến ${name} chưa khai báo.`);
    const e=parseExpression(text);f.priceDependent ||= dependsOnPrices(e);visit(e,x=>{if(x.type==="name"&&!known.has(x.name))throw Error(`Biến hoặc hằng ${x.name} chưa được hỗ trợ.`);if(x.type==="call"&&x.name==="request.security"){const symbol=literal(x.args[0]);if(typeof symbol!=="string"||!Object.hasOwn(EXTERNAL_SYMBOLS,symbol))throw Error(`Chưa hỗ trợ nguồn ${symbol}. Chỉ có 5 chuỗi dữ liệu BTC trong mẫu Cost of Production.`);if(literal(x.args[1])!=="D"||x.args[2]?.type!=="name"||x.args[2].name!=="close"||x.args[3]?.type!=="name"||x.args[3].name!=="barmerge.gaps_off"||x.args[4]?.type!=="name"||x.args[4].name!=="barmerge.lookahead_off")throw Error("request.security hỗ trợ D, close, gaps_off, lookahead_off.");f.requests.push(symbol);}});
    if(e.type==="call"&&e.name==="indicator"){f.overlay=e.options.overlay?literal(e.options.overlay)!==false:true;continue;}
    if(e.type==="call"&&e.name==="fill"){const first=e.args[0],second=e.args[1];const a=first?.type==="name"?handles.get(first.name):undefined,b=second?.type==="name"?handles.get(second.name):undefined;if(a===undefined||b===undefined)throw Error("fill() cần hai biến nhận kết quả plot().");f.fills.push({first:a,second:b,line:s.line,...color(e.options.color||e.args[2])});continue;}
    if(e.type==="call"&&e.name==="plot"){
      if(f.plots.length>=8)throw Error("Tối đa 8 plot().");if(!e.args[0])throw Error("plot() thiếu biểu thức.");const index=f.plots.length;const width=Number(literal(e.options.linewidth||e.args[3])||2);if(!Number.isInteger(width)||width<1||width>4)throw Error("linewidth cần 1–4.");f.plots.push({id:`plot-${index+1}`,title:String(literal(e.options.title||e.args[1])||`Đường ${index+1}`),...color(e.options.color||e.args[2],index),width:width as 1|2|3|4,kind:"expression",field:"close",length:1,expression:e.args[0],line:s.line,statement:f.statements.length});if(name)handles.set(name,index);f.statements.push({name,expression:e.args[0],line:s.line});
    }else{
      if(!name)throw Error("Cần khai báo biến hoặc plot/fill/indicator.");
      if(e.type==="call"&&e.name.startsWith("input.")){const kind=e.name.slice(6) as "bool"|"int"|"float",value=literal(e.args[0]);if(kind==="bool"?typeof value!=="boolean":typeof value!=="number")throw Error("input cần giá trị mặc định phù hợp.");const min=e.options.minval?Number(literal(e.options.minval)):undefined,max=e.options.maxval?Number(literal(e.options.maxval)):undefined,step=e.options.step?Number(literal(e.options.step)):undefined;
        if(kind!=="bool"&&(!Number.isFinite(value)||kind==="int"&&!Number.isInteger(value)||min!==undefined&&Number(value)<min||max!==undefined&&Number(value)>max))throw Error("Giá trị input nằm ngoài giới hạn hoặc không đúng kiểu số.");
        f.inputs.push({name,title:String(literal(e.args[1])||literal(e.options.title)||name),kind,value:value as number|boolean,statement:f.statements.length,min,max,step});}
      f.statements.push({name,expression:e,line:s.line});
    }
    if(name)known.add(name);
  }catch(error){throw Error(`Dòng ${s.line}: ${error instanceof Error?error.message:"Mã không hợp lệ."}`);}
  if(!f.plots.length)throw Error("Cần ít nhất một plot().");if(f.statements.length>100)throw Error("Tối đa 100 câu lệnh.");f.requests=[...new Set(f.requests)];
  return f;
}
export function frameSeconds(frame:string){const m=frame.match(/^(\d+)(m|h|d|w)$/);return m?Number(m[1])*({m:60,h:3600,d:86400,w:604800}[m[2]]||60):3600;}
type Scalar=number|string|boolean|null;type Value=Scalar|Array<number|null>;
function at(value:Value,index:number):Scalar{return Array.isArray(value)?value[index]:value;}
function numeric(v:Scalar):number|null {return v===null||typeof v==="string"?null:Number(v);}
function numberResult(v:number){return Number.isFinite(v)?v:null;}
const evaluationCache=new WeakMap<Formula,{key:string;data:OnchainData|null;value:{plots:Array<Array<number|null>>;fills:Formula["fills"]}}>();
export function evaluatePine(bars:Bar[],f:Formula,frame:string,onchain:OnchainData|null=null):{plots:Array<Array<number|null>>;fills:Formula["fills"]} {
  if(!bars.length)return{plots:f.plots.map(()=>[]),fills:f.fills};if(f.requests.length&&!onchain)throw Error("Đang chờ dữ liệu on-chain.");
  const cacheKey=frame+":"+bars.map(b=>b.time).join(",");const cached=evaluationCache.get(f);if(!f.priceDependent&&cached?.key===cacheKey&&cached.data===onchain)return cached.value;
  const seconds=frameSeconds(frame),first=bars[0].time;
  // Warm up requested daily inputs on the chart's own timeframe, including 90d SMA.
  // No fabricated OHLC history: price-only TA uses exactly the Binance bars loaded.
  const warm=f.requests.length?Math.ceil(92*86400/seconds):0;
  if(warm+bars.length>160000)throw Error("Khung quá nhỏ cho lịch sử on-chain. Hãy chọn từ 1m trở lên.");
  const times=[...Array.from({length:warm},(_,i)=>first-(warm-i)*seconds),...bars.map(b=>b.time)];const size=times.length;
  const environment:Record<string,Value>=Object.create(null);
  for(const name of ["open","high","low","close","volume","hl2","hlc3","ohlc4"]){environment[name]=[...Array(warm).fill(null),...bars.map(b=>name==="hl2"?(b.high+b.low)/2:name==="hlc3"?(b.high+b.low+b.close)/3:name==="ohlc4"?(b.open+b.high+b.low+b.close)/4:b[name as keyof Bar])];}
  environment.na=null;environment.true=true;environment.false=false;environment["timeframe.period"]=frame;environment["barmerge.gaps_off"]=0;environment["barmerge.lookahead_off"]=0;Object.entries(COLORS).forEach(([name,c])=>environment[`color.${name}`]=c);
  const external:Record<string,Array<number|null>>={};
  if(onchain){for(const symbol of f.requests){const field=EXTERNAL_SYMBOLS[symbol];let cursor=-1;external[symbol]=times.map(time=>{const closeTime=Math.min(time+seconds,Date.now()/1000);while(cursor+1<onchain.rows.length&&onchain.rows[cursor+1].time+86400<=closeTime)cursor++;return cursor<0?null:onchain.rows[cursor][field];});}}
  const combine=(a:Value,b:Value,op:(a:Scalar,b:Scalar)=>Scalar):Value=>Array.isArray(a)||Array.isArray(b)?Array.from({length:size},(_,i)=>{const v=op(at(a,i),at(b,i));return typeof v==="number"?numberResult(v):v===true?1:v===false?0:null;}):op(a,b);
  const evalExpr=(e:Expr):Value=>{
    if(e.type==="literal")return e.value;if(e.type==="name")return environment[e.name]??null;
    if(e.type==="unary"){const v=evalExpr(e.value);return combine(v,0,(a)=>a===null?null:e.op==="not"?!a:e.op==="-"?-(numeric(a)??NaN):numeric(a));}
    if(e.type==="binary"){const a=evalExpr(e.left),b=evalExpr(e.right);return combine(a,b,(x,y)=>{if(x===null||y===null)return null;const n=numeric(x)??NaN,m=numeric(y)??NaN;switch(e.op){case"+":return numberResult(n+m);case"-":return numberResult(n-m);case"*":return numberResult(n*m);case"/":return m===0?null:numberResult(n/m);case"%":return m===0?null:n%m;case">":return n>m;case"<":return n<m;case">=":return n>=m;case"<=":return n<=m;case"==":return x===y;case"!=":return x!==y;case"and":return !!x&&!!y;case"or":return !!x||!!y;default:return null;}});}
    if(e.type==="ternary"){const t=evalExpr(e.test),yes=evalExpr(e.yes),no=evalExpr(e.no);if(!Array.isArray(t))return t?yes:no;return times.map((_,i)=>{const v=at(t,i)?at(yes,i):at(no,i);return numeric(v);});}
    if(e.name.startsWith("input."))return evalExpr(e.args[0]);
    if(e.name==="request.security")return external[String(literal(e.args[0]))];
    if(e.name==="timeframe.in_seconds")return seconds;
    const args=e.args.map(evalExpr);
    if(e.name.startsWith("ta.")){
      const source=Array.isArray(args[0])?args[0]:Array(size).fill(numeric(args[0]));const n=Number(args[1]);if(Array.isArray(args[1])||!Number.isInteger(n)||n<1||n>150000)throw Error("Độ dài TA cần số nguyên 1–150.000.");
      const kind=e.name.slice(3);const result:Array<number|null>=Array(size).fill(null);
      if(kind==="sma"||kind==="stdev"){let sum=0,square=0,count=0;const queue:number[]=[];let start=0;for(let i=0;i<size;i++){const v=source[i];if(v===null){if(count===n)result[i]=kind==="sma"?sum/n:Math.sqrt(Math.max(0,square/n-(sum/n)**2));continue;}queue.push(v);sum+=v;square+=v*v;count++;if(count>n){const old=queue[start++];sum-=old;square-=old*old;count--;}if(count===n)result[i]=kind==="sma"?sum/n:Math.sqrt(Math.max(0,square/n-(sum/n)**2));}return result;}
      // Reuse proven basic TA on each contiguous sequence; unavailable warmup stays na.
      let start=0;while(start<size){while(start<size&&source[start]===null)start++;let end=start;while(end<size&&source[end]!==null)end++;if(end>start){const calculated=values(source.slice(start,end).map((v,i)=>({time:i,open:v!,high:v!,low:v!,close:v!,volume:0})),{kind:kind as "ema"|"rsi",field:"close",length:n});for(let i=start;i<end;i++)result[i]=calculated[i-start];}start=end+1;}return result;
    }
    if(e.name==="math.max"||e.name==="math.min")return args.reduce((previous,current)=>combine(previous,current,(a,b)=>{const n=numeric(a),m=numeric(b);return n===null||m===null?null:e.name==="math.max"?Math.max(n,m):Math.min(n,m);}));
    const a=args[0]??null,b=args[1]??null;
    return combine(a,b,(x,y)=>{const n=numeric(x),m=numeric(y);if(n===null)return null;switch(e.name){case"int":return Math.trunc(n);case"float":return n;case"math.floor":return Math.floor(n);case"math.round":return Math.round(n);case"math.abs":return Math.abs(n);case"math.sqrt":return n<0?null:Math.sqrt(n);case"math.pow":return m===null?null:numberResult(Math.pow(n,m));case"math.max":return m===null?null:Math.max(n,m);case"math.min":return m===null?null:Math.min(n,m);default:throw Error(`Chưa hỗ trợ ${e.name} trong biểu thức.`);}});
  };
  const output:Array<Array<number|null>>=f.plots.map(()=>[]);
  f.statements.forEach((s,index)=>{try{const result=evalExpr(s.expression);if(s.name)environment[s.name]=result;f.plots.forEach((p,j)=>{if(p.statement===index)output[j]=times.map((_,i)=>numeric(at(result,i))).slice(warm);});}catch(error){throw Error(`Dòng ${s.line}: ${error instanceof Error?error.message:"Không tính được."}`);}});
  const result={plots:output,fills:f.fills};if(!f.priceDependent)evaluationCache.set(f,{key:cacheKey,data:onchain,value:result});return result;
}
function serialize(e:Expr):string {if(e.type==="literal")return e.value===null?"na":typeof e.value==="string"?JSON.stringify(e.value):String(e.value);if(e.type==="name")return e.name;if(e.type==="call")return `${e.name}(${[...e.args.map(serialize),...Object.entries(e.options).map(([k,v])=>`${k} = ${serialize(v)}`)].join(", ")})`;if(e.type==="binary")return`(${serialize(e.left)} ${e.op} ${serialize(e.right)})`;if(e.type==="unary")return`${e.op}(${serialize(e.value)})`;return`(${serialize(e.test)} ? ${serialize(e.yes)} : ${serialize(e.no)})`;}
function patchStatement(source:string,targetLine:number,expression:Expr){const items=statements(source);const item=items.find(x=>x.line===targetLine);if(!item)return source;const lines=source.split("\n");const index=items.indexOf(item),end=index+1<items.length?items[index+1].line-1:lines.length;let last=targetLine-1,depth=0;for(let i=targetLine-1;i<end;i++){const stripped=lines[i].replace(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^']*'/g,"").split("//")[0];depth+=(stripped.match(/\(/g)||[]).length-(stripped.match(/\)/g)||[]).length;last=i;if(!depth)break;}const name=item.text.match(/^([A-Za-z_]\w*)\s*(:=|=)/);lines.splice(targetLine-1,last-targetLine+2,`${name?`${name[1]} ${name[2]} `:""}${serialize(expression)}`);return lines.join("\n");}
export function setPinePlotColor(raw:string,index:number,c:string){if(!/^#[0-9a-f]{6}$/i.test(c))return raw;const f=parsePine(raw),plot=f.plots[index];if(!plot)return raw;const statement=statements(f.source).find(x=>x.line===plot.line)!;const e=parseExpression(statement.text.replace(/^[A-Za-z_]\w*\s*=\s*/,""));if(e.type!=="call")return raw;const old=e.options.color;e.options.color=old?.type==="call"&&old.name==="color.new"?{...old,args:[{type:"literal",value:c},old.args[1]]}:{type:"literal",value:c};return patchStatement(f.source,plot.line,e);}
export function setPineInput(raw:string,name:string,value:number|boolean){const f=parsePine(raw),input=f.inputs.find(x=>x.name===name);if(!input)return raw;const s=f.statements[input.statement],e=s.expression;if(e.type!=="call")return raw;return patchStatement(f.source,s.line,{...e,args:[{type:"literal",value},...e.args.slice(1)]});}

export function setPineFillColor(raw:string,index:number,c:string){if(!/^#[0-9a-f]{6}$/i.test(c))return raw;const f=parsePine(raw),fill=f.fills[index];if(!fill)return raw;const item=statements(f.source).find(x=>x.line===fill.line)!;const e=parseExpression(item.text);if(e.type!=="call")return raw;const old=e.options.color||e.args[2];e.options.color=old?.type==="call"&&old.name==="color.new"?{...old,args:[{type:"literal",value:c},old.args[1]]}:{type:"literal",value:c};if(e.args.length>2)e.args=e.args.slice(0,2);return patchStatement(f.source,fill.line,e);}
