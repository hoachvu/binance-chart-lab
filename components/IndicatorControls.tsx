"use client";
import { useState } from "react";
import { DEFAULT_INDICATOR_SETTINGS, type IndicatorSettings, type PriceField } from "@/lib/indicators";

type Key=keyof IndicatorSettings;
type Props={kind:Key;settings:IndicatorSettings;change:(kind:Key,patch:Record<string,unknown>)=>void};
const sources:Array<[PriceField,string]>=[["close","Đóng cửa"],["open","Mở cửa"],["high","Cao nhất"],["low","Thấp nhất"],["hl2","HL2"],["hlc3","HLC3"],["ohlc4","OHLC4"]];
function NumberInput({value,min,max,step=1,onChange}:{value:number;min:number;max:number;step?:number;onChange:(value:number)=>void}){
  const [draft,setDraft]=useState(String(value));
  const commit=()=>{const n=Number(draft);const next=Number.isFinite(n)&&draft.trim()?Math.min(max,Math.max(min,step===1?Math.round(n):Math.round(n/step)*step)):value;setDraft(String(next));onChange(next)};
  return <input type="number" inputMode="decimal" min={min} max={max} step={step} value={draft} onChange={e=>setDraft(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")e.currentTarget.blur()}}/>;
}
export default function IndicatorControls({kind,settings,change}:Props){
  const number=(label:string,value:number,min:number,max:number,field:string,step=1)=><label className="setting-field"><span>{label}</span><NumberInput key={`${kind}-${field}-${value}`} value={value} min={min} max={max} step={step} onChange={n=>change(kind,{[field]:n})}/></label>;
  const color=(label:string,value:string,field:string)=><label className="setting-field color-setting"><span><i style={{background:value}}/>{label}</span><span className="color-control"><input type="color" value={value} aria-label={label} onInput={e=>change(kind,{[field]:e.currentTarget.value})} onChange={e=>change(kind,{[field]:e.target.value})}/><code>{value.toUpperCase()}</code></span></label>;
  const source=(value:PriceField)=><label className="setting-field"><span>Nguồn giá</span><select value={value} onChange={e=>change(kind,{source:e.target.value})}>{sources.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label>;
  const method=(value:"sma"|"ema")=><label className="setting-field"><span>Kiểu trung bình</span><select value={value} onChange={e=>change(kind,{method:e.target.value})}><option value="sma">SMA</option><option value="ema">EMA</option></select></label>;
  const width=(value:number)=>number("Độ dày",value,1,4,"width");
  return <div className="indicator-settings" aria-label="Tùy chỉnh chỉ báo">
    <div className="setting-grid">
      {kind==="ma"&&<>{number("Chu kỳ",settings.ma.period,2,500,"period")}{method(settings.ma.method)}{source(settings.ma.source)}{width(settings.ma.width)}{color("Màu đường",settings.ma.color,"color")}</>}
      {kind==="bb"&&<>{number("Chu kỳ",settings.bb.period,2,500,"period")}{number("Độ lệch chuẩn",settings.bb.deviation,.1,10,"deviation",.1)}{method(settings.bb.method)}{source(settings.bb.source)}{width(settings.bb.width)}{color("Đường Upper",settings.bb.upperColor,"upperColor")}{color("Đường Basis",settings.bb.basisColor,"basisColor")}{color("Đường Lower",settings.bb.lowerColor,"lowerColor")}{color("Nền giữa hai dải",settings.bb.fillColor,"fillColor")}{number("Độ đậm nền (%)",settings.bb.fillOpacity,0,40,"fillOpacity")}</>}
      {kind==="rsi"&&<>{number("Chu kỳ",settings.rsi.period,2,200,"period")}{source(settings.rsi.source)}{number("Quá mua",settings.rsi.overbought,settings.rsi.oversold+1,99,"overbought")}{number("Quá bán",settings.rsi.oversold,1,settings.rsi.overbought-1,"oversold")}{width(settings.rsi.width)}{color("Đường RSI",settings.rsi.color,"color")}{color("Ngưỡng quá mua",settings.rsi.overboughtColor,"overboughtColor")}{color("Ngưỡng quá bán",settings.rsi.oversoldColor,"oversoldColor")}{color("Đường giữa 50",settings.rsi.midColor,"midColor")}{color("Nền vùng RSI",settings.rsi.backgroundColor,"backgroundColor")}{number("Độ đậm nền (%)",settings.rsi.backgroundOpacity,0,30,"backgroundOpacity")}</>}
      {kind==="volume"&&<>{color("Cột tăng",settings.volume.upColor,"upColor")}{color("Cột giảm",settings.volume.downColor,"downColor")}</>}
    </div>
    <button type="button" className="reset-indicator" onClick={()=>change(kind,{...DEFAULT_INDICATOR_SETTINGS[kind]})}>Khôi phục mặc định</button>
  </div>;
}
