"use client";
import { useEffect, useRef } from "react";
import { CandlestickSeries, HistogramSeries, LineSeries, createChart, ColorType, customSeriesDefaultOptions, type CustomData, type CustomSeriesOptions, type IChartApi, type ICustomSeriesPaneRenderer, type ICustomSeriesPaneView, type ISeriesApi, type PaneRendererCustomData, type PriceToCoordinateConverter, type Time, type UTCTimestamp } from "lightweight-charts";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import { Scan } from "lucide-react";
import { bands, values, type Bar, type Formula, type IndicatorSettings } from "@/lib/indicators";

type Props={bars:Bar[];enabled:Record<string,boolean>;settings:IndicatorSettings;formula:Formula|null;onNeedHistory:(endTime:number)=>void;onHover:(bar:Bar|null)=>void};
type Extra={name:string;series:Parameters<IChartApi["removeSeries"]>[0]};
type BandData=CustomData<Time>&{upper:number;lower:number};
type BandOptions=CustomSeriesOptions&{fillColor:string;fillOpacity:number};

function hexRgba(hex:string,opacity:number){
  const value=hex.replace("#","");const number=Number.parseInt(value,16);
  return `rgba(${number>>16},${number>>8&255},${number&255},${Math.max(0,Math.min(1,opacity))})`;
}
class BandRenderer implements ICustomSeriesPaneRenderer{
  private data:PaneRendererCustomData<Time,BandData>|null=null;private options:BandOptions|null=null;
  update(data:PaneRendererCustomData<Time,BandData>,options:BandOptions){this.data=data;this.options=options;}
  draw(target:CanvasRenderingTarget2D,priceConverter:PriceToCoordinateConverter){
    const data=this.data,options=this.options;if(!data?.visibleRange||!options||options.fillOpacity<=0)return;
    const from=Math.max(0,data.visibleRange.from),to=Math.min(data.bars.length,data.visibleRange.to);
    const visible=data.bars.slice(from,to).map(bar=>{const upper=priceConverter(bar.originalData.upper),lower=priceConverter(bar.originalData.lower);return upper===null||lower===null?null:{x:Number(bar.x),upper:Number(upper),lower:Number(lower)};}).filter((bar):bar is {x:number;upper:number;lower:number}=>bar!==null);if(visible.length<2)return;
    target.useMediaCoordinateSpace(({context})=>{
      context.save();context.beginPath();
      visible.forEach((bar,index)=>{if(index===0)context.moveTo(bar.x,bar.upper);else context.lineTo(bar.x,bar.upper);});
      for(let index=visible.length-1;index>=0;index--){const bar=visible[index];context.lineTo(bar.x,bar.lower);}
      context.closePath();context.fillStyle=hexRgba(options.fillColor,options.fillOpacity);context.fill();context.restore();
    });
  }
}
class BandPaneView implements ICustomSeriesPaneView<Time,BandData,BandOptions>{
  private drawView=new BandRenderer();
  renderer(){return this.drawView;}
  update(data:PaneRendererCustomData<Time,BandData>,options:BandOptions){this.drawView.update(data,options);}
  priceValueBuilder(data:BandData):[number,number,number]{return[data.lower,data.upper,(data.lower+data.upper)/2];}
  isWhitespace(data:BandData|CustomData):data is CustomData{return!("upper" in data)||!("lower" in data);}
  defaultOptions():BandOptions{return{...customSeriesDefaultOptions,color:"#8f7af8",fillColor:"#8f7af8",fillOpacity:.12};}
}
export default function CandleChart({bars,enabled,settings,formula,onNeedHistory,onHover}:Props){
  const host=useRef<HTMLDivElement>(null);const chart=useRef<IChartApi|null>(null);
  const candles=useRef<ISeriesApi<"Candlestick">|null>(null);
  const extra=useRef<Extra[]>([]),layoutKey=useRef("");
  const history=useRef(onNeedHistory);const hovered=useRef(onHover);const latest=useRef<Bar[]>(bars);
  useEffect(()=>{history.current=onNeedHistory;hovered.current=onHover;latest.current=bars;},[bars,onNeedHistory,onHover]);
  useEffect(()=>{
    if(!host.current)return;
    const c=createChart(host.current,{autoSize:true,layout:{background:{type:ColorType.Solid,color:"#0b121c"},textColor:"#90a1b8",fontFamily:"Inter, system-ui, sans-serif",fontSize:12},grid:{vertLines:{color:"#1a2939"},horzLines:{color:"#1a2939"}},crosshair:{vertLine:{color:"#657f9b",labelBackgroundColor:"#26384c"},horzLine:{color:"#657f9b",labelBackgroundColor:"#26384c"}},rightPriceScale:{borderColor:"#314053"},timeScale:{borderColor:"#314053",timeVisible:true,secondsVisible:false,rightOffset:8,barSpacing:8},handleScroll:{mouseWheel:true,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},handleScale:{axisPressedMouseMove:true,mouseWheel:true,pinch:true},kineticScroll:{mouse:true,touch:true},localization:{locale:"vi-VN"}});
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
    const fill=(name:string,upper:Array<number|null>,lower:Array<number|null>,fillColor:string,fillOpacity:number,pane=0)=>{
      let s=extra.current.find(x=>x.name===name)?.series as unknown as {setData:(data:BandData[])=>void}|undefined;
      if(!s){const created=c.addCustomSeries(new BandPaneView(),{color:fillColor,fillColor,fillOpacity:fillOpacity/100,priceLineVisible:false,lastValueVisible:false},pane);extra.current.push({name,series:created});s=created as unknown as {setData:(data:BandData[])=>void};}
      s.setData(upper.flatMap((value,index)=>value===null||lower[index]===null?[]:[{time:bars[index].time as UTCTimestamp,upper:value,lower:lower[index]!}]));
    };
    if(enabled.ma)line("ma",values(bars,{kind:settings.ma.method,field:settings.ma.source,length:settings.ma.period}),settings.ma.color,0,settings.ma.width);
    if(enabled.bb){const bb=bands(bars,settings.bb.period,settings.bb.deviation,settings.bb.source,settings.bb.method);fill("bb-fill",bb.upper,bb.lower,settings.bb.fillColor,settings.bb.fillOpacity);line("bb-upper",bb.upper,settings.bb.upperColor,0,settings.bb.width);line("bb-middle",bb.middle,settings.bb.basisColor,0,settings.bb.width);line("bb-lower",bb.lower,settings.bb.lowerColor,0,settings.bb.width);}
    let pane=1;
    if(enabled.volume){let s=extra.current.find(x=>x.name==="volume")?.series as ISeriesApi<"Histogram">|undefined;if(!s){s=c.addSeries(HistogramSeries,{priceFormat:{type:"volume"},priceLineVisible:false,lastValueVisible:false},pane);extra.current.push({name:"volume",series:s});}s.setData(bars.map(b=>({time:b.time as UTCTimestamp,value:b.volume,color:b.close>=b.open?settings.volume.upColor:settings.volume.downColor})));pane++;}
    if(enabled.rsi){const rsiPane=pane++;fill("rsi-zone",bars.map(()=>settings.rsi.overbought),bars.map(()=>settings.rsi.oversold),settings.rsi.backgroundColor,settings.rsi.backgroundOpacity,rsiPane);line("rsi",values(bars,{kind:"rsi",field:settings.rsi.source,length:settings.rsi.period}),settings.rsi.color,rsiPane,settings.rsi.width);if(changed){const series=extra.current.find(x=>x.name==="rsi")?.series as ISeriesApi<"Line">|undefined;series?.createPriceLine({price:settings.rsi.overbought,color:settings.rsi.overboughtColor,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"Quá mua"});series?.createPriceLine({price:50,color:settings.rsi.midColor,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"50"});series?.createPriceLine({price:settings.rsi.oversold,color:settings.rsi.oversoldColor,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"Quá bán"});}}
    if(formula){const formulaPane=formula.overlay?0:pane++;formula.plots.forEach((plot,index)=>line(`custom-${index}`,values(bars,plot),plot.color,formulaPane,plot.width));}
    const panes=c.panes();if(panes.length>1&&changed){panes[0].setHeight(Math.max(250,Math.floor((host.current?.clientHeight||600)*.67)));}
  },[bars,enabled,settings,formula]);
  return <><div className="chart-surface" ref={host} aria-label="Biểu đồ nến Binance; kéo để xem lịch sử, chụm hai ngón hoặc dùng con lăn để phóng to"/><button type="button" className="chart-reset" onClick={()=>chart.current?.timeScale().fitContent()} title="Vừa toàn bộ dữ liệu" aria-label="Vừa toàn bộ dữ liệu biểu đồ"><Scan size={17}/></button></>;
}
