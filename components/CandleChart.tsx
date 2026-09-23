"use client";
import { useEffect, useRef } from "react";
import { CandlestickSeries, HistogramSeries, LineSeries, createChart, ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { bands, values, type Bar, type Formula } from "@/lib/indicators";

type Props={bars:Bar[];enabled:Record<string,boolean>;formula:Formula|null;onNeedHistory:(endTime:number)=>void;onHover:(bar:Bar|null)=>void};
type Extra={name:string;series:ISeriesApi<"Line"|"Histogram">};
export default function CandleChart({bars,enabled,formula,onNeedHistory,onHover}:Props){
  const host=useRef<HTMLDivElement>(null);const chart=useRef<IChartApi|null>(null);
  const candles=useRef<ISeriesApi<"Candlestick">|null>(null);
  const extra=useRef<Extra[]>([]),layoutKey=useRef("");
  const history=useRef(onNeedHistory);const hovered=useRef(onHover);const latest=useRef<Bar[]>(bars);
  useEffect(()=>{history.current=onNeedHistory;hovered.current=onHover;latest.current=bars;},[bars,onNeedHistory,onHover]);
  useEffect(()=>{
    if(!host.current)return;
    const c=createChart(host.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:"#0b121c"},textColor:"#90a1b8",fontFamily:"Inter, system-ui, sans-serif",fontSize:12},grid:{vertLines:{color:"#1a2939"},horzLines:{color:"#1a2939"}},crosshair:{vertLine:{color:"#657f9b",labelBackgroundColor:"#26384c"},horzLine:{color:"#657f9b",labelBackgroundColor:"#26384c"}},rightPriceScale:{borderColor:"#314053"},timeScale:{borderColor:"#314053",timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:8},localization:{locale:"vi-VN"}});
    chart.current=c;candles.current=c.addSeries(CandlestickSeries,{upColor:"#28c4a6",downColor:"#f26972",wickUpColor:"#28c4a6",wickDownColor:"#f26972",borderVisible:false});
    c.subscribeCrosshairMove(param=>{const t=param.time as number|undefined;hovered.current(t?latest.current.find(x=>x.time===t)||null:null);});
    c.timeScale().subscribeVisibleLogicalRangeChange(range=>{if(range && range.from<60 && latest.current.length>0)history.current(latest.current[0].time*1000-1);});
    return()=>{c.remove();chart.current=null;candles.current=null;extra.current=[];layoutKey.current="";};
  },[]);
  useEffect(()=>{
    const c=chart.current;if(!c||!candles.current)return;
    const price=bars[bars.length-1]?.close||1;
    const precision=price>=100?2:price>=1?4:price>=.01?6:8;
    candles.current.applyOptions({priceFormat:{type:"price",precision,minMove:10**-precision}});
    candles.current.setData(bars.map(b=>({...b,time:b.time as UTCTimestamp})));
    const key=JSON.stringify([enabled.ma,enabled.bb,enabled.volume,enabled.rsi,formula]);
    const changed=layoutKey.current!==key||!bars.length;
    if(changed){extra.current.forEach(({series})=>c.removeSeries(series));extra.current=[];layoutKey.current=key;}
    if(!bars.length)return;
    const line=(name:string,arr:Array<number|null>,color:string,pane=0,width:1|2=1)=>{
      let s=extra.current.find(x=>x.name===name)?.series as ISeriesApi<"Line">|undefined;
      if(!s){s=c.addSeries(LineSeries,{color,lineWidth:width,priceLineVisible:false,lastValueVisible:true,crosshairMarkerVisible:false},pane);extra.current.push({name,series:s});}
      s.setData(arr.flatMap((v,i)=>v===null||!Number.isFinite(v)?[]:[{time:bars[i].time as UTCTimestamp,value:v}]));
    };
    if(enabled.ma)line("ma",values(bars,{kind:"sma",field:"close",length:20,overlay:true}),"#ffcc73",0,2);
    if(enabled.bb){const bb=bands(bars);line("bb-upper",bb.upper,"#ad8ef8");line("bb-middle",bb.middle,"#ad8ef8");line("bb-lower",bb.lower,"#ad8ef8");}
    let pane=1;
    if(enabled.volume){let s=extra.current.find(x=>x.name==="volume")?.series as ISeriesApi<"Histogram">|undefined;if(!s){s=c.addSeries(HistogramSeries,{priceFormat:{type:"volume"},priceLineVisible:false,lastValueVisible:false},pane);extra.current.push({name:"volume",series:s});}s.setData(bars.map(b=>({time:b.time as UTCTimestamp,value:b.volume,color:b.close>=b.open?"#249e8c88":"#d15b6788"})));pane++;}
    if(enabled.rsi)line("rsi",values(bars,{kind:"rsi",field:"close",length:14,overlay:false}),"#7daaff",pane++);
    if(formula)line("custom",values(bars,formula),"#e8a0e6",formula.overlay?0:pane++,2);
    const panes=c.panes();if(panes.length>1&&changed){panes[0].setHeight(Math.max(250,Math.floor((host.current?.clientHeight||600)*.67)));}
  },[bars,enabled,formula]);
  return <div className="chart-surface" ref={host} aria-label="Biểu đồ nến Binance; kéo để xem lịch sử, dùng con lăn để phóng to" />;
}
