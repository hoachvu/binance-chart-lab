type Market = "spot" | "futures";
type QuoteRow = { symbol: string; price: number; changePercent: number };
type Cached = { until: number; row: QuoteRow };

const cache = new Map<string, Cached>();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const market: Market = url.searchParams.get("market") === "futures" ? "futures" : "spot";
  const symbols = [...new Set((url.searchParams.get("symbols") ?? "").split(",")
    .map(value => value.trim().toUpperCase())
    .filter(value => /^[A-Z0-9]{5,20}$/.test(value)))]
    .slice(0, 40);
  if (!symbols.length) return Response.json({ quotes: [] }, { headers: { "Cache-Control": "no-store" } });

  try {
    const endpoints = market === "spot"
      ? ["https://data-api.binance.vision/api/v3/klines"]
      : ["https://fapi.binance.com/fapi/v1/klines", "https://fapi1.binance.com/fapi/v1/klines", "https://fapi2.binance.com/fapi/v1/klines"];
    const results = await Promise.allSettled(symbols.map(async symbol => {
      const key = `${market}:${symbol}`;
      const cached = cache.get(key);
      if (cached && cached.until > Date.now()) return cached.row;
      const params = new URLSearchParams({ symbol, interval: "1h", limit: "25" });
      let candles: unknown = null;
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(`${endpoint}?${params}`, { signal: AbortSignal.timeout(7000) });
          const candidate = await response.json() as unknown;
          if (response.ok && Array.isArray(candidate)) { candles = candidate; break; }
        } catch { /* Try the next official Binance Futures host. */ }
      }
      if (!Array.isArray(candles) || candles.length < 2) throw new Error("Invalid ticker response");
      const first = candles[0] as Array<string | number>;
      const last = candles.at(-1) as Array<string | number>;
      const open = Number(first[1]);
      const price = Number(last[4]);
      if (!Number.isFinite(open) || !Number.isFinite(price) || open <= 0) throw new Error("Invalid ticker values");
      const row = { symbol, price, changePercent: ((price - open) / open) * 100 };
      cache.set(key, { until: Date.now() + 5000, row });
      return row;
    }));
    const quotes = results.flatMap(result => {
      if (result.status !== "fulfilled") return [];
      const row = result.value;
      const symbol = row.symbol;
      const price = row.price;
      const changePercent = row.changePercent;
      if (!Number.isFinite(price) || !Number.isFinite(changePercent)) return [];
      return [{ symbol, price, changePercent }];
    });
    if (!quotes.length) throw new Error("No ticker responses");
    return Response.json({ quotes }, { headers: { "Cache-Control": "public, max-age=5" } });
  } catch {
    return Response.json({ error: "Không tải được giá watchlist từ Binance" }, { status: 503 });
  }
}
