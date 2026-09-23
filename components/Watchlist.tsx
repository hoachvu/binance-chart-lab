"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ListPlus, Pencil, Plus, Search, Trash2, Wifi, WifiOff } from "lucide-react";
import { quoteKey, type Market, type Quote, type WatchGroup, type WatchItem } from "@/lib/watchlist";

export type Pair = { symbol: string; baseAsset: string; quoteAsset: string };

type Props = {
  groups: WatchGroup[];
  activeGroupId: string;
  currentMarket: Market;
  currentSymbol: string;
  pairs: Pair[];
  onActiveGroup: (id: string) => void;
  onSelect: (item: WatchItem) => void;
  onAdd: (groupId: string, item: WatchItem) => void;
  onRemove: (groupId: string, itemId: string) => void;
  onMove: (groupId: string, itemId: string, direction: -1 | 1) => void;
  onCreateGroup: (name: string) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (id: string) => void;
};

const QUOTE_PRIORITY = ["USDT", "USDC", "FDUSD", "USD", "BTC", "ETH", "BNB", "EUR", "TRY"];

function formatPrice(price: number) {
  if (!Number.isFinite(price)) return "—";
  const maximumFractionDigits = price >= 100 ? 2 : price >= 1 ? 4 : price >= 0.01 ? 6 : 8;
  return price.toLocaleString("en-US", { maximumFractionDigits });
}

function useWatchQuotes(groups: WatchGroup[]) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [connected, setConnected] = useState<Record<Market, boolean>>({ spot: false, futures: false });
  const pending = useRef<Record<string, Quote>>({});
  const frame = useRef<number | null>(null);
  const targets = useMemo(() => {
    const unique = new Map<string, WatchItem>();
    groups.forEach(group => group.items.forEach(item => unique.set(quoteKey(item.market, item.symbol), item)));
    return [...unique.values()].slice(0, 80);
  }, [groups]);
  const targetKey = targets.map(item => quoteKey(item.market, item.symbol)).sort().join("|");

  useEffect(() => {
    let closed = false;
    const sockets: WebSocket[] = [];
    const retries: Array<ReturnType<typeof setTimeout>> = [];
    const openCounts: Record<Market, number> = { spot: 0, futures: 0 };
    const flush = () => {
      frame.current = null;
      const next = pending.current;
      pending.current = {};
      if (!closed && Object.keys(next).length) setQuotes(current => ({ ...current, ...next }));
    };
    const queue = (market: Market, symbol: string, price: number, changePercent: number) => {
      if (!Number.isFinite(price) || !Number.isFinite(changePercent)) return;
      pending.current[quoteKey(market, symbol)] = { price, changePercent, updatedAt: Date.now() };
      if (frame.current === null) frame.current = window.requestAnimationFrame(flush);
    };
    const itemsFor = (market: Market) => targets.filter(item => item.market === market);
    const sync = async (market: Market) => {
      const items = itemsFor(market);
      if (!items.length) return;
      if (market === "futures") {
        const results = await Promise.allSettled(items.map(async item => {
          const url = new URL("https://fapi.binance.com/fapi/v1/klines");
          url.searchParams.set("symbol", item.symbol);
          url.searchParams.set("interval", "1h");
          url.searchParams.set("limit", "25");
          const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
          const candles = await response.json() as Array<Array<string | number>>;
          if (!response.ok || !Array.isArray(candles) || candles.length < 2) throw new Error("Invalid futures quote");
          const open = Number(candles[0][1]);
          const price = Number(candles[candles.length - 1][4]);
          return { symbol: item.symbol, price, changePercent: ((price - open) / open) * 100 };
        }));
        results.forEach(result => {
          if (result.status === "fulfilled") queue(market, result.value.symbol, result.value.price, result.value.changePercent);
        });
        return;
      }
      const params = new URLSearchParams({ market, symbols: items.map(item => item.symbol).join(",") });
      try {
        const response = await fetch(`/api/quotes?${params}`, { cache: "no-store" });
        const data = await response.json() as { quotes?: Array<{ symbol: string; price: number; changePercent: number }> };
        if (!response.ok || !Array.isArray(data.quotes)) return;
        data.quotes.forEach(quote => queue(market, quote.symbol, Number(quote.price), Number(quote.changePercent)));
      } catch { /* WebSocket can still keep the list current. */ }
    };
    const connect = (market: Market, item: WatchItem, attempt = 0) => {
      if (closed) return;
      const stream = `${item.symbol.toLowerCase()}@ticker`;
      const host = market === "spot" ? "wss://stream.binance.com:9443/ws/" : "wss://fstream.binance.com/ws/";
      const socket = new WebSocket(host + stream);
      sockets.push(socket);
      socket.onopen = () => {
        openCounts[market] += 1;
        setConnected(current => ({ ...current, [market]: true }));
      };
      socket.onmessage = event => {
        try {
          const payload = JSON.parse(String(event.data)) as { data?: { s?: string; c?: string; P?: string }; s?: string; c?: string; P?: string };
          const ticker = payload.data ?? payload;
          if (ticker?.s) queue(market, ticker.s, Number(ticker.c), Number(ticker.P));
        } catch { /* Ignore malformed Binance frames. */ }
      };
      socket.onerror = () => socket.close();
      socket.onclose = () => {
        if (closed) return;
        openCounts[market] = Math.max(0, openCounts[market] - 1);
        if (openCounts[market] === 0) setConnected(current => ({ ...current, [market]: false }));
        retries.push(setTimeout(() => connect(market, item, Math.min(attempt + 1, 5)), Math.min(30000, 1500 * 2 ** attempt)));
      };
    };
    (["spot", "futures"] as Market[]).forEach(market => {
      void sync(market);
      itemsFor(market).forEach(item => connect(market, item));
    });
    const poll = window.setInterval(() => (["spot", "futures"] as Market[]).forEach(market => { void sync(market); }), 20000);
    return () => {
      closed = true;
      sockets.forEach(socket => socket.close());
      retries.forEach(clearTimeout);
      window.clearInterval(poll);
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    };
  // targetKey is a compact identity for the subscriptions; targets is intentionally derived from it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);

  return { quotes, connected };
}

export default function Watchlist({ groups, activeGroupId, currentMarket, currentSymbol, pairs, onActiveGroup, onSelect, onAdd, onRemove, onMove, onCreateGroup, onRenameGroup, onDeleteGroup }: Props) {
  const activeGroup = groups.find(group => group.id === activeGroupId) ?? groups[0];
  const { quotes, connected } = useWatchQuotes(groups);
  const [query, setQuery] = useState("");
  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const normalizedQuery = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const matches = useMemo(() => {
    if (!normalizedQuery) return [];
    const rank = (pair: Pair) => {
      const quoteRank = QUOTE_PRIORITY.indexOf(pair.quoteAsset);
      return [pair.baseAsset === normalizedQuery ? 0 : pair.baseAsset.startsWith(normalizedQuery) ? 1 : 2, quoteRank < 0 ? 100 : quoteRank, pair.symbol] as const;
    };
    return pairs
      .filter(pair => pair.baseAsset.startsWith(normalizedQuery) || pair.symbol.startsWith(normalizedQuery))
      .sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1] || rank(a)[2].localeCompare(rank(b)[2]))
      .slice(0, 10);
  }, [normalizedQuery, pairs]);

  if (!activeGroup) return null;
  const addPair = (pair: Pair) => {
    onAdd(activeGroup.id, { id: quoteKey(currentMarket, pair.symbol), market: currentMarket, symbol: pair.symbol, baseAsset: pair.baseAsset, quoteAsset: pair.quoteAsset });
    setQuery("");
  };
  const createGroup = () => {
    const name = groupName.trim();
    if (!name) return;
    onCreateGroup(name);
    setGroupName("");
    setAddingGroup(false);
  };
  const renameGroup = () => {
    const name = window.prompt("Tên mới của danh sách", activeGroup.name)?.trim();
    if (name) onRenameGroup(activeGroup.id, name);
  };

  return <div className="watchlist-panel">
    <div className="watchlist-head">
      <div>
        <span className="panel-eyebrow">THỊ TRƯỜNG</span>
        <h2>Watchlist</h2>
      </div>
      <span className="watch-connection" title="Kết nối giá trực tiếp">
        {connected.spot || connected.futures ? <Wifi size={15}/> : <WifiOff size={15}/>} trực tiếp
      </span>
    </div>
    <div className="group-toolbar">
      <select aria-label="Chọn danh sách theo dõi" value={activeGroup.id} onChange={event => onActiveGroup(event.target.value)}>
        {groups.map(group => <option key={group.id} value={group.id}>{group.name} ({group.items.length})</option>)}
      </select>
      <button type="button" onClick={() => setAddingGroup(value => !value)} title="Tạo danh sách"><ListPlus size={16}/></button>
      <button type="button" onClick={renameGroup} title="Đổi tên"><Pencil size={15}/></button>
      <button type="button" disabled={groups.length === 1} onClick={() => onDeleteGroup(activeGroup.id)} title="Xóa danh sách"><Trash2 size={15}/></button>
    </div>
    {addingGroup && <form className="new-group" onSubmit={event => { event.preventDefault(); createGroup(); }}>
      <input autoFocus value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={40} placeholder="Tên danh sách mới"/>
      <button type="submit" aria-label="Tạo danh sách"><Check size={16}/></button>
    </form>}
    <div className="watch-search">
      <Search size={15}/>
      <input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Thêm cặp ${currentMarket === "spot" ? "Spot" : "Futures"}`} aria-label="Tìm cặp để thêm vào watchlist"/>
    </div>
    {normalizedQuery && <div className="watch-search-results">
      {matches.length ? matches.map(pair => {
        const exists = activeGroup.items.some(item => item.market === currentMarket && item.symbol === pair.symbol);
        return <button type="button" key={pair.symbol} disabled={exists} onClick={() => addPair(pair)}>
          <span><strong>{pair.baseAsset}</strong>/{pair.quoteAsset}<small>{currentMarket === "spot" ? "Spot" : "Futures"}</small></span>
          {exists ? <Check size={15}/> : <Plus size={15}/>} 
        </button>;
      }) : <p>Không tìm thấy cặp phù hợp.</p>}
    </div>}
    <div className="watch-table-head"><span>Cặp giao dịch</span><span>Giá</span><span>24h</span><span/></div>
    <div className="watch-items">
      {activeGroup.items.length ? activeGroup.items.map((item, index) => {
        const quote = quotes[quoteKey(item.market, item.symbol)];
        const active = item.market === currentMarket && item.symbol === currentSymbol;
        const direction = (quote?.changePercent ?? 0) >= 0 ? "positive" : "negative";
        return <div className={`watch-row ${active ? "active" : ""}`} key={item.id}>
          <button type="button" className="watch-symbol" onClick={() => onSelect(item)} aria-label={`Mở ${item.baseAsset}/${item.quoteAsset} ${item.market}`}>
            <strong>{item.baseAsset}<span>/{item.quoteAsset}</span></strong>
            <small>{item.market === "spot" ? "Spot" : "USDⓈ-M"}</small>
          </button>
          <button type="button" className="watch-price" onClick={() => onSelect(item)}>{quote ? formatPrice(quote.price) : "—"}</button>
          <button type="button" className={`watch-change ${direction}`} onClick={() => onSelect(item)}>{quote ? `${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}%` : "—"}</button>
          <div className="watch-actions">
            <button type="button" disabled={index === 0} onClick={() => onMove(activeGroup.id, item.id, -1)} title="Đưa lên"><ArrowUp size={13}/></button>
            <button type="button" disabled={index === activeGroup.items.length - 1} onClick={() => onMove(activeGroup.id, item.id, 1)} title="Đưa xuống"><ArrowDown size={13}/></button>
            <button type="button" onClick={() => onRemove(activeGroup.id, item.id)} title="Xóa khỏi watchlist"><Trash2 size={13}/></button>
          </div>
        </div>;
      }) : <div className="watch-empty"><p>Danh sách đang trống.</p><span>Tìm một cặp ở phía trên để thêm.</span></div>}
    </div>
  </div>;
}
