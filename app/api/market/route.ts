const INTERVALS = new Set(["1m","3m","5m","15m","30m","1h","2h","4h","6h","8h","12h","1d","3d","1w","1M"]);
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams;
    const market = q.get("market") === "futures" ? "futures" : "spot";
    const symbol = (q.get("symbol") || "BTCUSDT").toUpperCase();
    const interval = q.get("interval") || "1h";
    if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !INTERVALS.has(interval)) return Response.json({error:"Cặp hoặc khung thời gian không hợp lệ"}, {status:400});
    const bases = market === "spot"
      ? ["https://data-api.binance.vision"]
      : ["https://fapi.binance.com", "https://fapi1.binance.com", "https://fapi2.binance.com"];
    const path = market === "spot" ? "/api/v3/klines" : "/fapi/v1/klines";
    const endTime = q.get("endTime");
    let data: unknown = null;
    for (const base of bases) {
      try {
        const url = new URL(path, base);
        url.searchParams.set("symbol", symbol); url.searchParams.set("interval", interval); url.searchParams.set("limit", "500");
        if (endTime && /^\d{10,13}$/.test(endTime)) url.searchParams.set("endTime", endTime);
        const response = await fetch(url, { cache:"no-store", signal: AbortSignal.timeout(7000), headers:{"Accept":"application/json"} });
        const candidate = await response.json() as unknown;
        if (response.ok && Array.isArray(candidate)) { data = candidate; break; }
      } catch { /* Try the next official Binance Futures host. */ }
    }
    if (!Array.isArray(data)) return Response.json({error:"Binance không trả dữ liệu cho cặp này hoặc tạm từ chối kết nối."},{status:502});
    return Response.json({ symbol, market, interval, bars: data.map((k: unknown) => {
      const a = k as (string | number)[];
      return { time:Math.floor(Number(a[0])/1000), open:Number(a[1]), high:Number(a[2]), low:Number(a[3]), close:Number(a[4]), volume:Number(a[5]) };
    }) },{headers:{"Cache-Control":"no-store, no-cache, must-revalidate"}});
  } catch { return Response.json({error:"Không thể kết nối Binance lúc này."},{status:502}); }
}
