"use client";
import { useEffect, useRef } from "react";
import { CandlestickSeries, HistogramSeries, LineSeries, createChart, ColorType, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import { bands, values, type Bar, type Formula, type IndicatorSettings } from "@/lib/indicators";

type Props={bars:Bar[];enabled:Record<string,boolean>;settings:IndicatorSettings;formula:Formula|null;onNeedHistory:(endTime:number)=>void;onHover:(bar:Bar|null)=>void};
type Extra={name:string;series:ISeriesApi<"Line"|"Histogram">};
export default function CandleChart({bars,enabled,settings,formula,onNeedHistory,onHover}:Props){
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
    const key=JSON.stringify([enabled.ma,enabled.bb,enabled.volume,enabled.rsi,settings,formula]);
    const changed=layoutKey.current!==key||!bars.length;
    if(changed){extra.current.forEach(({series})=>c.removeSeries(series));extra.current=[];layoutKey.current=key;}
    if(!bars.length)return;
    const line=(name:string,arr:Array<number|null>,color:string,pane=0,width:1|2|3|4=1)=>{
      let s=extra.current.find(x=>x.name===name)?.series as ISeriesApi<"Line">|undefined;
      if(!s){s=c.addSeries(LineSeries,{color,lineWidth:width,priceLineVisible:false,lastValueVisible:true,crosshairMarkerVisible:false},pane);extra.current.push({name,series:s});}
      s.setData(arr.flatMap((v,i)=>v===null||!Number.isFinite(v)?[]:[{time:bars[i].time as UTCTimestamp,value:v}]));
    };
    if(enabled.ma)line("ma",values(bars,{kind:settings.ma.method,field:settings.ma.source,length:settings.ma.period,overlay:true}),settings.ma.color,0,settings.ma.width);
    if(enabled.bb){const bb=bands(bars,settings.bb.period,settings.bb.deviation,settings.bb.source,settings.bb.method);line("bb-upper",bb.upper,settings.bb.color,0,settings.bb.width);line("bb-middle",bb.middle,settings.bb.color,0,settings.bb.width);line("bb-lower",bb.lower,settings.bb.color,0,settings.bb.width);}
    let pane=1;
    if(enabled.volume){let s=extra.current.find(x=>x.name==="volume")?.series as ISeriesApi<"Histogram">|undefined;if(!s){s=c.addSeries(HistogramSeries,{priceFormat:{type:"volume"},priceLineVisible:false,lastValueVisible:false},pane);extra.current.push({name:"volume",series:s});}s.setData(bars.map(b=>({time:b.time as UTCTimestamp,value:b.volume,color:b.close>=b.open?settings.volume.upColor:settings.volume.downColor})));pane++;}
    if(enabled.rsi){const rsiPane=pane++;line("rsi",values(bars,{kind:"rsi",field:settings.rsi.source,length:settings.rsi.period,overlay:false}),settings.rsi.color,rsiPane,settings.rsi.width);if(changed){const series=extra.current.find(x=>x.name==="rsi")?.series as ISeriesApi<"Line">|undefined;series?.createPriceLine({price:settings.rsi.overbought,color:"#cc8790",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"Quá mua"});series?.createPriceLine({price:settings.rsi.oversold,color:"#53bba2",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"Quá bán"});}}
    if(formula)line("custom",values(bars,formula),"#e8a0e6",formula.overlay?0:pane++,2);
    const panes=c.panes();if(panes.length>1&&changed){panes[0].setHeight(Math.max(250,Math.floor((host.current?.clientHeight||600)*.67)));}
  },[bars,enabled,settings,formula]);
  return <div className="chart-surface" ref={host} aria-label="Biểu đồ nến Binance; kéo để xem lịch sử, dùng con lăn để phóng to" />;
}
