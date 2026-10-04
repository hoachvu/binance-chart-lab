import { parsePine, setPineInput, setPinePlotColor, setPineFillColor, type Formula } from "./pine";
import { COST_OF_PRODUCTION } from "./pine-example";
export type CostSettings={smoothed:boolean;raw:boolean;smoothedColor:string;rawColor:string;zoneColor:string;zoneOpacity:number};
export const DEFAULT_COST_SETTINGS:CostSettings={smoothed:true,raw:false,smoothedColor:"#9c27b0",rawColor:"#ffeb3b",zoneColor:"#9c27b0",zoneOpacity:40};
export function normalizeCostSettings(raw:unknown):CostSettings {
  const value=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
  const hex=(input:unknown,fallback:string)=>typeof input==="string"&&/^#[0-9a-f]{6}$/i.test(input)?input:fallback;
  return{smoothed:typeof value.smoothed==="boolean"?value.smoothed:true,raw:typeof value.raw==="boolean"?value.raw:false,smoothedColor:hex(value.smoothedColor,DEFAULT_COST_SETTINGS.smoothedColor),rawColor:hex(value.rawColor,DEFAULT_COST_SETTINGS.rawColor),zoneColor:hex(value.zoneColor,DEFAULT_COST_SETTINGS.zoneColor),zoneOpacity:typeof value.zoneOpacity==="number"&&Number.isFinite(value.zoneOpacity)?Math.min(100,Math.max(0,Math.round(value.zoneOpacity))):40};
}
// The model is denominated in USD; it must not change an ETH or BTC/ETH price scale.
export function supportsCostOfProduction(symbol:string){return /^BTC(?:USD|USDT|USDC|FDUSD|TUSD|USDP|BUSD|DAI)$/.test(symbol);}
export function costFormula(settings:CostSettings):Formula {
  const result=parsePine(COST_OF_PRODUCTION);
  for(const [name,value] of [["showSmoothed",settings.smoothed],["showRaw",settings.raw]] as const){const input=result.inputs.find(i=>i.name===name)!;input.value=value;const expression=result.statements[input.statement].expression;if(expression.type==="call")expression.args[0]={type:"literal",value};}
  result.plots[0].color=settings.smoothedColor;result.plots[1].color=settings.rawColor;result.plots[2].color=settings.zoneColor;
  result.fills[0].color=settings.zoneColor;result.fills[0].opacity=settings.zoneOpacity/100;
  return result;
}
export function costSource(settings:CostSettings){
  let source=setPineInput(setPineInput(COST_OF_PRODUCTION,"showSmoothed",settings.smoothed),"showRaw",settings.raw);
  source=setPinePlotColor(setPinePlotColor(setPinePlotColor(source,0,settings.smoothedColor),1,settings.rawColor),2,settings.zoneColor);
  source=setPineFillColor(source,0,settings.zoneColor);
  return source.replace(/(fill\([^\n]+color\.new\("#[0-9a-f]{6}",\s*)\d+(\))/i,`$1${100-settings.zoneOpacity}$2`);
}
