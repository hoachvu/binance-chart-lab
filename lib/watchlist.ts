export type Market = "spot" | "futures";

export type WatchItem = {
  id: string;
  market: Market;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
};

export type WatchGroup = {
  id: string;
  name: string;
  items: WatchItem[];
};

export type Quote = {
  price: number;
  changePercent: number;
  updatedAt: number;
};

export const DEFAULT_WATCHLISTS: WatchGroup[] = [
  {
    id: "favorites",
    name: "Yêu thích",
    items: [
      { id: "spot:BTCUSDT", market: "spot", symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" },
      { id: "spot:ETHUSDT", market: "spot", symbol: "ETHUSDT", baseAsset: "ETH", quoteAsset: "USDT" },
    ],
  },
];

const cleanText = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

export function normalizeWatchlists(input: unknown): WatchGroup[] {
  if (!Array.isArray(input)) return DEFAULT_WATCHLISTS;
  const groups = input.slice(0, 12).flatMap((raw, groupIndex) => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    const id = cleanText(record.id, 80) || `group-${groupIndex + 1}`;
    const name = cleanText(record.name, 40) || `Danh sách ${groupIndex + 1}`;
    const seen = new Set<string>();
    const items = (Array.isArray(record.items) ? record.items : []).slice(0, 50).flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const item = entry as Record<string, unknown>;
      const market: Market = item.market === "futures" ? "futures" : "spot";
      const symbol = cleanText(item.symbol, 20).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const baseAsset = cleanText(item.baseAsset, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const quoteAsset = cleanText(item.quoteAsset, 12).toUpperCase().replace(/[^A-Z0-9]/g, "");
      const key = `${market}:${symbol}`;
      if (!/^[A-Z0-9]{5,20}$/.test(symbol) || !baseAsset || !quoteAsset || seen.has(key)) return [];
      seen.add(key);
      return [{ id: key, market, symbol, baseAsset, quoteAsset } satisfies WatchItem];
    });
    return [{ id, name, items } satisfies WatchGroup];
  });
  return groups.length ? groups : DEFAULT_WATCHLISTS;
}

export function parseWatchlists(value: unknown): WatchGroup[] {
  if (typeof value === "string") {
    try { return normalizeWatchlists(JSON.parse(value)); } catch { return DEFAULT_WATCHLISTS; }
  }
  return normalizeWatchlists(value);
}

export function quoteKey(market: Market, symbol: string) {
  return `${market}:${symbol}`;
}
