"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, ChartCandlestick, ChevronDown, CircleHelp, Code2, List, RefreshCw, Settings2, Shield, Star, Wifi, WifiOff, X } from "lucide-react";
import CandleChart from "./CandleChart";
import IndicatorControls from "./IndicatorControls";
import Watchlist, { type Pair } from "./Watchlist";
import { DEFAULT_INDICATOR_SETTINGS, normalizeIndicatorSettings, parsePine, setPinePlotColor, type Bar, type Formula, type IndicatorSettings } from "@/lib/indicators";
import { DEFAULT_WATCHLISTS, normalizeWatchlists, parseWatchlists, quoteKey, type Market, type WatchGroup, type WatchItem } from "@/lib/watchlist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Script = { id: string; name: string; source: string };
type Account = { email: string; role: string; displayName: string };
type Panel = "watchlist" | "indicators" | "editor" | "help";
type WorkspaceResponse = {
  me: Account;
  scripts?: Script[];
  config?: { market?: Market; symbol?: string; interval?: string; enabled?: string; watchlist?: string } | null;
  error?: string;
};
type Selection = { market: Market; symbol: string; interval: string };

const DEFAULT_ENABLED = { ma: true, bb: false, rsi: true, volume: true };
const GUEST_SCRIPTS = "chartlab:guest:scripts:v1";
const GUEST_SETTINGS = "chartlab:guest:settings:v1";
const GUEST_WATCHLISTS = "chartlab:guest:watchlists:v2";
const ACTIVE_WATCHLIST = "chartlab:active-watchlist:v1";
const LEGACY_WATCHLIST = "chartlab:guest:watchlist:v1";
const FRAMES = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];
const SAMPLE = '//@version=5\nindicator("MA cá nhân", overlay=true)\nlength = input.int(30)\nplot(ta.sma(close, length))';
const PALETTE = [{ key: "ma", title: "Moving Average" }, { key: "bb", title: "Bollinger Bands" }, { key: "rsi", title: "RSI" }, { key: "volume", title: "Volume" }] as const;
const QUOTE_PRIORITY = ["USDT", "USDC", "FDUSD", "USD", "BTC", "ETH", "BNB", "EUR", "TRY"];

async function getPairs(market: Market): Promise<Pair[]> {
  const parse = (data: unknown): Pair[] => {
    const payload = data as { pairs?: Pair[]; symbols?: Array<Pair & { status: string; contractType?: string }> };
    if (Array.isArray(payload.pairs)) return payload.pairs;
    if (Array.isArray(payload.symbols)) return payload.symbols
      .filter(pair => pair.status === "TRADING" && (!pair.contractType || pair.contractType === "PERPETUAL"))
      .map(({ symbol, baseAsset, quoteAsset }) => ({ symbol, baseAsset, quoteAsset }));
    throw new Error("Invalid pairs");
  };
  try {
    const response = await fetch(`/api/symbols?market=${market}`);
    if (response.ok) return parse(await response.json());
  } catch { /* Try Binance directly below. */ }
  const url = market === "spot" ? "https://data-api.binance.vision/api/v3/exchangeInfo" : "https://fapi.binance.com/fapi/v1/exchangeInfo";
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Không tải được danh sách cặp Binance");
  return parse(await response.json());
}

async function workspaceApi<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(data.error || "Thao tác thất bại");
  return data;
}

function preferredPair(pairs: Pair[], baseAsset: string) {
  const rank = (quote: string) => {
    const index = QUOTE_PRIORITY.indexOf(quote);
    return index < 0 ? 100 : index;
  };
  return pairs.filter(pair => pair.baseAsset === baseAsset).sort((a, b) => rank(a.quoteAsset) - rank(b.quoteAsset) || a.symbol.localeCompare(b.symbol))[0];
}

export default function Workspace() {
  const [market, setMarket] = useState<Market>("spot");
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [symbolDraft, setSymbolDraft] = useState("BTCUSDT");
  const [interval, setInterval] = useState("1h");
  const [enabled, setEnabled] = useState<Record<string, boolean>>(DEFAULT_ENABLED);
  const [indicatorSettings, setIndicatorSettings] = useState<IndicatorSettings>(DEFAULT_INDICATOR_SETTINGS);
  const [expanded, setExpanded] = useState<keyof IndicatorSettings | null>(null);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [pairOpen, setPairOpen] = useState(false);
  const [pairLoading, setPairLoading] = useState(false);
  const [bars, setBars] = useState<Bar[]>([]);
  const [barsKey, setBarsKey] = useState("");
  const [status, setStatus] = useState("Đang tải");
  const [error, setError] = useState("");
  const [hover, setHover] = useState<Bar | null>(null);
  const [panel, setPanel] = useState<Panel>("watchlist");
  const [panelOpen, setPanelOpen] = useState(false);
  const [me, setMe] = useState<Account | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scriptName, setScriptName] = useState("Chỉ báo của tôi");
  const [source, setSource] = useState(SAMPLE);
  const [activeScript, setActiveScript] = useState<string | null>(null);
  const [formula, setFormula] = useState<Formula | null>(null);
  const [watchlists, setWatchlists] = useState<WatchGroup[]>(DEFAULT_WATCHLISTS);
  const [activeGroupId, setActiveGroupId] = useState(DEFAULT_WATCHLISTS[0].id);
  const [watchReady, setWatchReady] = useState(false);
  const watchlistsRef = useRef<WatchGroup[]>(DEFAULT_WATCHLISTS);
  const historyBusy = useRef(false);
  const oldest = useRef(0);
  const historyEnd = useRef(0);
  const dataRef = useRef<Bar[]>([]);
  const selectedBase = useRef("BTC");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dataKey = `${market}|${symbol}|${interval}`;
  const visibleBars = barsKey === dataKey ? bars : [];
  const shown = (barsKey === dataKey ? hover : null) || visibleBars[visibleBars.length - 1];

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 4500);
  }, []);

  const persist = useCallback(async (body: Record<string, unknown>) => {
    if (me?.role !== "guest") return workspaceApi<{ id?: string; ok?: boolean }>(body);
    const action = String(body.action);
    if (action === "saveSettings") {
      localStorage.setItem(GUEST_SETTINGS, JSON.stringify({ market: body.market, symbol: body.symbol, interval: body.interval, enabled: JSON.stringify(body.enabled) }));
      return { ok: true };
    }
    if (action === "saveWatchlist") {
      localStorage.setItem(GUEST_WATCHLISTS, JSON.stringify(body.watchlists));
      return { ok: true };
    }
    if (action === "saveScript") {
      const id = typeof body.id === "string" ? body.id : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const next = [{ id, name: String(body.name), source: String(body.source) }, ...scripts.filter(script => script.id !== id)];
      localStorage.setItem(GUEST_SCRIPTS, JSON.stringify(next));
      return { id };
    }
    if (action === "deleteScript") {
      localStorage.setItem(GUEST_SCRIPTS, JSON.stringify(scripts.filter(script => script.id !== body.id)));
      return { ok: true };
    }
    throw new Error("Thao tác này cần đăng nhập.");
  }, [me?.role, scripts]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace").then(async response => {
      const data = await response.json() as WorkspaceResponse;
      if (!response.ok) throw new Error(data.error);
      if (data.me?.role === "guest") {
        try {
          const saved = JSON.parse(localStorage.getItem(GUEST_SCRIPTS) || "[]") as unknown;
          data.scripts = Array.isArray(saved) ? saved as Script[] : [];
        } catch { data.scripts = []; }
        try { data.config = JSON.parse(localStorage.getItem(GUEST_SETTINGS) || "null") as WorkspaceResponse["config"]; } catch { data.config = null; }
      }
      if (cancelled) return;
      const loadedScripts = data.scripts || [];
      setMe(data.me);
      setScripts(loadedScripts);
      if (data.config) {
        const savedMarket: Market = data.config.market === "futures" ? "futures" : "spot";
        const savedSymbol = String(data.config.symbol || "BTCUSDT").toUpperCase();
        setMarket(savedMarket);
        setSymbol(savedSymbol);
        setSymbolDraft(savedSymbol);
        setInterval(FRAMES.includes(String(data.config.interval)) ? String(data.config.interval) : "1h");
        try {
          const saved = JSON.parse(data.config.enabled || "{}") as Record<string, unknown>;
          setEnabled({ ...DEFAULT_ENABLED, ...Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === "boolean")) });
          setIndicatorSettings(normalizeIndicatorSettings(saved._indicatorSettings));
          if (typeof saved._activeScript === "string") {
            const found = loadedScripts.find(script => script.id === saved._activeScript);
            if (found) { setActiveScript(found.id); setFormula(parsePine(found.source)); }
          }
        } catch { /* Keep safe defaults. */ }
      }
      let loadedWatchlists: WatchGroup[];
      if (data.me?.role === "guest") {
        const current = localStorage.getItem(GUEST_WATCHLISTS);
        if (current) loadedWatchlists = parseWatchlists(current);
        else {
          const legacy = localStorage.getItem(LEGACY_WATCHLIST);
          loadedWatchlists = legacy ? normalizeWatchlists([{ id: "favorites", name: "Yêu thích", items: JSON.parse(legacy) as unknown }]) : DEFAULT_WATCHLISTS;
          localStorage.setItem(GUEST_WATCHLISTS, JSON.stringify(loadedWatchlists));
        }
      } else loadedWatchlists = parseWatchlists(data.config?.watchlist);
      watchlistsRef.current = loadedWatchlists;
      setWatchlists(loadedWatchlists);
      try {
        const selected = localStorage.getItem(ACTIVE_WATCHLIST);
        setActiveGroupId(loadedWatchlists.some(group => group.id === selected) ? selected! : loadedWatchlists[0].id);
      } catch { setActiveGroupId(loadedWatchlists[0].id); }
      setWatchReady(true);
      setReady(true);
    }).catch(cause => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : "Không tải được tài khoản");
      setReady(true);
      setWatchReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!ready || !me) return;
    const timer = setTimeout(() => {
      void persist({ action: "saveSettings", market, symbol, interval, enabled: { ...enabled, _activeScript: activeScript, _indicatorSettings: indicatorSettings } })
        .catch(() => flash("Chưa lưu được cấu hình"));
    }, 800);
    return () => clearTimeout(timer);
  }, [ready, me, market, symbol, interval, enabled, activeScript, indicatorSettings, persist, flash]);

  useEffect(() => {
    if (!watchReady || !me || me.role === "guest") return;
    void persist({ action: "saveWatchlist", watchlists }).catch(() => flash("Chưa lưu được watchlist"));
  }, [watchReady, me, watchlists, persist, flash]);

  const selectWatchGroup = (id: string) => {
    setActiveGroupId(id);
    try { localStorage.setItem(ACTIVE_WATCHLIST, id); } catch { flash("Trình duyệt chưa lưu được danh sách đang chọn"); }
  };

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) setPairLoading(true);
      return getPairs(market);
    }).then(nextPairs => {
      if (cancelled) return;
      setPairs(nextPairs);
      if (!nextPairs.some(pair => pair.symbol === symbol)) {
        const replacement = preferredPair(nextPairs, selectedBase.current) || nextPairs.find(pair => pair.symbol === "BTCUSDT");
        if (replacement) {
          setSymbol(replacement.symbol);
          setSymbolDraft(replacement.symbol);
          selectedBase.current = replacement.baseAsset;
        }
      }
    }).catch(() => { if (!cancelled) setPairs([]); }).finally(() => { if (!cancelled) setPairLoading(false); });
    return () => { cancelled = true; };
  }, [market, symbol]);

  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options: { signal: AbortSignal }) => Promise<void> | void } }).modelContext;
    if (!ready || !me || !context?.registerTool) return;
    const controller = new AbortController();
    try {
      void Promise.resolve(context.registerTool({
        name: "configure_binance_chart",
        title: "Chọn biểu đồ Binance",
        description: "Chọn Spot hoặc Futures USDⓈ-M, cặp giao dịch và khung thời gian trên biểu đồ đang mở.",
        inputSchema: { type: "object", properties: { market: { type: "string", enum: ["spot", "futures"] }, symbol: { type: "string", pattern: "^[A-Za-z0-9]{5,20}$" }, interval: { type: "string", enum: FRAMES } }, required: ["market", "symbol", "interval"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input: unknown) => {
          const value = input as Record<string, unknown>;
          const nextMarket: Market = value.market === "futures" ? "futures" : "spot";
          const nextSymbol = String(value.symbol).toUpperCase();
          const nextInterval = String(value.interval);
          if (!FRAMES.includes(nextInterval) || !/^[A-Z0-9]{5,20}$/.test(nextSymbol)) throw new Error("Cặp hoặc khung không hợp lệ");
          setMarket(nextMarket); setSymbol(nextSymbol); setSymbolDraft(nextSymbol); setInterval(nextInterval);
          return { market: nextMarket, symbol: nextSymbol, interval: nextInterval };
        },
      }, { signal: controller.signal })).catch(() => {});
    } catch { /* Model context is optional. */ }
    return () => controller.abort();
  }, [ready, me]);

  const load = useCallback(async (selection: Selection, endTime?: number, signal?: AbortSignal) => {
    const query = new URLSearchParams({ market: selection.market, symbol: selection.symbol, interval: selection.interval });
    if (endTime) query.set("endTime", String(endTime));
    try {
      const response = await fetch(`/api/market?${query}`, { cache: "no-store", signal });
      const data = await response.json() as { symbol?: string; market?: string; interval?: string; bars?: Bar[] };
      if (response.ok && data.symbol === selection.symbol && data.market === selection.market && data.interval === selection.interval && Array.isArray(data.bars)) return data.bars;
    } catch (cause) {
      if (signal?.aborted) throw cause;
    }
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const direct = new URL(selection.market === "spot" ? "https://data-api.binance.vision/api/v3/klines" : "https://fapi.binance.com/fapi/v1/klines");
    direct.searchParams.set("symbol", selection.symbol);
    direct.searchParams.set("interval", selection.interval);
    direct.searchParams.set("limit", "500");
    if (endTime) direct.searchParams.set("endTime", String(endTime));
    try {
      const timeout = AbortSignal.timeout(12000);
      const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const response = await fetch(direct, { cache: "no-store", signal: requestSignal });
      const rows = await response.json() as (string | number)[][];
      if (!response.ok || !Array.isArray(rows)) throw new Error();
      return rows.map(row => ({ time: Math.floor(Number(row[0]) / 1000), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }));
    } catch (cause) {
      if (signal?.aborted) throw cause;
      throw new Error("Không kết nối được Binance từ máy chủ hoặc trình duyệt. Hãy kiểm tra mạng rồi thử lại.");
    }
  }, []);

  useEffect(() => {
    if (!ready || !me) return;
    const selection = { market, symbol, interval } satisfies Selection;
    const selectionKey = `${selection.market}|${selection.symbol}|${selection.interval}`;
    const controller = new AbortController();
    let closed = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let poll: number | undefined;
    let attempt = 0;
    const commit = (callback: () => void) => { if (!closed && !controller.signal.aborted) callback(); };
    const refresh = async () => {
      try {
        const fresh = await load(selection, undefined, controller.signal);
        commit(() => {
          const merged = new Map<number, Bar>(dataRef.current.map(bar => [bar.time, bar]));
          fresh.forEach(bar => merged.set(bar.time, bar));
          dataRef.current = [...merged.values()].sort((a, b) => a.time - b.time).slice(-1500);
          setBars([...dataRef.current]);
          setStatus(socket?.readyState === WebSocket.OPEN ? "Trực tiếp" : "Đồng bộ định kỳ");
          if (socket?.readyState === WebSocket.OPEN && poll) { window.clearInterval(poll); poll = undefined; }
        });
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Không tải được dữ liệu");
      }
    };
    const connect = () => {
      if (closed) return;
      const stream = `${selection.symbol.toLowerCase()}@kline_${selection.interval}`;
      const host = selection.market === "spot" ? "wss://stream.binance.com:9443/ws/" : "wss://fstream.binance.com/ws/";
      try {
        socket = new WebSocket(host + stream);
        socket.onopen = () => commit(() => {
          attempt = 0; setStatus("Trực tiếp"); setError("");
          if (poll && dataRef.current.length > 10) { window.clearInterval(poll); poll = undefined; }
        });
        socket.onmessage = event => {
          try {
            const kline = (JSON.parse(String(event.data)) as { k?: Record<string, unknown> }).k;
            if (!kline || String(kline.s) !== selection.symbol) return;
            const bar: Bar = { time: Math.floor(Number(kline.t) / 1000), open: Number(kline.o), high: Number(kline.h), low: Number(kline.l), close: Number(kline.c), volume: Number(kline.v) };
            commit(() => {
              const current = dataRef.current;
              if (!current.length) current.push(bar);
              else if (bar.time === current[current.length - 1].time) current[current.length - 1] = bar;
              else if (bar.time > current[current.length - 1].time) current.push(bar);
              else return;
              dataRef.current = [...current];
              setBars(dataRef.current);
            });
          } catch { /* Ignore malformed Binance frames. */ }
        };
        socket.onerror = () => socket?.close();
        socket.onclose = () => commit(() => {
          setStatus("Đang kết nối lại");
          if (!poll) poll = window.setInterval(() => { void refresh(); }, 15000);
          retry = setTimeout(connect, Math.min(30000, 1500 * 2 ** Math.min(attempt++, 5)));
        });
      } catch {
        commit(() => {
          setStatus("Đồng bộ định kỳ");
          if (!poll) poll = window.setInterval(() => { void refresh(); }, 15000);
          retry = setTimeout(connect, 10000);
        });
      }
    };
    Promise.resolve().then(() => {
      if (closed) return;
      dataRef.current = [];
      oldest.current = 0;
      historyEnd.current = 0;
      historyBusy.current = false;
      setBarsKey(selectionKey);
      setBars([]);
      setHover(null);
      setStatus("Đang tải");
      setError("");
      return load(selection, undefined, controller.signal);
    }).then(initial => {
      if (!initial) return;
      commit(() => {
        dataRef.current = initial;
        setBars(initial);
        oldest.current = initial[0]?.time || 0;
        setStatus("Đang kết nối");
        connect();
      });
    }).catch(cause => {
      if (controller.signal.aborted) return;
      commit(() => {
        setError(cause instanceof Error ? cause.message : "Không tải được dữ liệu");
        setStatus("Chờ Binance");
        poll = window.setInterval(() => { void refresh(); }, 15000);
        connect();
      });
    });
    return () => {
      closed = true;
      controller.abort();
      socket?.close();
      clearTimeout(retry);
      if (poll) window.clearInterval(poll);
    };
  }, [ready, me, load, market, symbol, interval]);

  const more = useCallback(async (endTime: number) => {
    if (historyBusy.current || !oldest.current || endTime >= oldest.current * 1000 || historyEnd.current === endTime) return;
    historyBusy.current = true;
    historyEnd.current = endTime;
    const selection = { market, symbol, interval } satisfies Selection;
    const expectedKey = `${market}|${symbol}|${interval}`;
    try {
      const older = await load(selection, endTime);
      if (older.length && expectedKey === dataKey) {
        const merged = new Map<number, Bar>([...older, ...dataRef.current].map(bar => [bar.time, bar]));
        dataRef.current = [...merged.values()].sort((a, b) => a.time - b.time).slice(-3000);
        oldest.current = dataRef.current[0].time;
        setBars([...dataRef.current]);
      }
    } catch { flash("Chưa tải được nến cũ"); }
    finally { historyBusy.current = false; }
  }, [load, market, symbol, interval, dataKey, flash]);

  const matches = useMemo(() => {
    const query = symbolDraft.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!query) return [];
    const rank = (pair: Pair) => {
      const quoteIndex = QUOTE_PRIORITY.indexOf(pair.quoteAsset);
      return [pair.baseAsset === query ? 0 : pair.baseAsset.startsWith(query) ? 1 : 2, quoteIndex < 0 ? 100 : quoteIndex, pair.symbol] as const;
    };
    return pairs.filter(pair => pair.baseAsset.startsWith(query) || pair.symbol.startsWith(query))
      .sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1] - rank(b)[1] || rank(a)[2].localeCompare(rank(b)[2]))
      .slice(0, 50);
  }, [pairs, symbolDraft]);

  const openPanel = (next: Panel) => { setPanel(next); setPanelOpen(true); };
  const selectPair = (pair: Pair, nextMarket = market) => {
    selectedBase.current = pair.baseAsset;
    setMarket(nextMarket);
    setSymbol(pair.symbol);
    setSymbolDraft(pair.symbol);
    setPairOpen(false);
    flash(`Đang mở ${pair.baseAsset}/${pair.quoteAsset}`);
  };
  const selectWatchItem = (item: WatchItem) => {
    selectPair({ symbol: item.symbol, baseAsset: item.baseAsset, quoteAsset: item.quoteAsset }, item.market);
    setPanelOpen(false);
  };
  const submitPair = () => {
    const query = symbolDraft.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const exact = pairs.find(pair => pair.symbol === query);
    if (exact) return selectPair(exact);
    const preferred = preferredPair(pairs, query);
    if (preferred) return selectPair(preferred);
    if (!pairs.length && /^[A-Z0-9]{5,20}$/.test(query)) {
      setSymbol(query); setSymbolDraft(query); setPairOpen(false); return;
    }
    if (matches.length === 1) return selectPair(matches[0]);
    setPairOpen(true);
  };
  const changeMarket = (next: Market) => {
    if (next === market) return;
    setMarket(next);
    setPairOpen(false);
  };

  const updateWatchlists = (updater: (groups: WatchGroup[]) => WatchGroup[]) => {
    const next = normalizeWatchlists(updater(watchlistsRef.current));
    watchlistsRef.current = next;
    if (me?.role === "guest") {
      try { localStorage.setItem(GUEST_WATCHLISTS, JSON.stringify(next)); }
      catch { flash("Trình duyệt chưa lưu được watchlist"); }
    }
    setWatchlists(next);
  };
  const addWatchItem = (groupId: string, item: WatchItem) => updateWatchlists(groups => groups.map(group => group.id !== groupId || group.items.some(existing => existing.id === item.id) ? group : { ...group, items: [...group.items, item] }));
  const removeWatchItem = (groupId: string, itemId: string) => updateWatchlists(groups => groups.map(group => group.id === groupId ? { ...group, items: group.items.filter(item => item.id !== itemId) } : group));
  const moveWatchItem = (groupId: string, itemId: string, direction: -1 | 1) => updateWatchlists(groups => groups.map(group => {
    if (group.id !== groupId) return group;
    const index = group.items.findIndex(item => item.id === itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= group.items.length) return group;
    const items = [...group.items];
    [items[index], items[target]] = [items[target], items[index]];
    return { ...group, items };
  }));
  const createWatchGroup = (name: string) => {
    const id = `group-${Date.now().toString(36)}`;
    updateWatchlists(groups => [...groups, { id, name, items: [] }]);
    selectWatchGroup(id);
  };
  const renameWatchGroup = (id: string, name: string) => updateWatchlists(groups => groups.map(group => group.id === id ? { ...group, name } : group));
  const deleteWatchGroup = (id: string) => {
    if (watchlists.length === 1 || !window.confirm("Xóa danh sách theo dõi này?")) return;
    updateWatchlists(groups => groups.filter(group => group.id !== id));
    selectWatchGroup(watchlistsRef.current[0].id);
  };
  const addCurrentToWatchlist = () => {
    const pair = pairs.find(candidate => candidate.symbol === symbol);
    if (!pair) return flash("Chưa xác định được cặp hiện tại");
    const groupId = watchlists.some(group => group.id === activeGroupId) ? activeGroupId : watchlists[0].id;
    const item: WatchItem = { id: quoteKey(market, pair.symbol), market, symbol: pair.symbol, baseAsset: pair.baseAsset, quoteAsset: pair.quoteAsset };
    if (watchlists.find(group => group.id === groupId)?.items.some(existing => existing.id === item.id)) return flash("Cặp này đã có trong watchlist");
    addWatchItem(groupId, item);
    flash(`Đã thêm ${pair.baseAsset}/${pair.quoteAsset} vào watchlist`);
  };

  const active = useMemo(() => scripts.find(script => script.id === activeScript), [scripts, activeScript]);
  const sourceProgram = useMemo(() => { try { return parsePine(source); } catch { return null; } }, [source]);
  const toggle = (key: string) => setEnabled(current => ({ ...current, [key]: !current[key] }));
  const changeIndicator = (key: keyof IndicatorSettings, patch: Record<string, unknown>) => setIndicatorSettings(current => normalizeIndicatorSettings({ ...current, [key]: { ...current[key], ...patch } }));
  const detail = (key: keyof IndicatorSettings) => key === "ma" ? `${indicatorSettings.ma.method.toUpperCase()} · ${indicatorSettings.ma.period}` : key === "bb" ? `${indicatorSettings.bb.period} · ${indicatorSettings.bb.deviation}σ` : key === "rsi" ? `${indicatorSettings.rsi.period} kỳ · ${indicatorSettings.rsi.overbought}/${indicatorSettings.rsi.oversold}` : "Khối lượng";
  const mark = (key: keyof IndicatorSettings) => key === "volume"
    ? `linear-gradient(135deg,${indicatorSettings.volume.upColor} 0 48%,${indicatorSettings.volume.downColor} 52% 100%)`
    : key === "bb"
      ? `linear-gradient(135deg,${indicatorSettings.bb.upperColor} 0 31%,${indicatorSettings.bb.basisColor} 34% 64%,${indicatorSettings.bb.lowerColor} 67% 100%)`
      : key === "rsi"
        ? `linear-gradient(135deg,${indicatorSettings.rsi.overboughtColor} 0 31%,${indicatorSettings.rsi.color} 34% 64%,${indicatorSettings.rsi.oversoldColor} 67% 100%)`
        : indicatorSettings.ma.color;
  const changePlotColor = (index: number, color: string) => {
    const next = setPinePlotColor(source, index, color);
    setSource(next);
    try { setFormula(parsePine(next)); } catch { /* Keep editing until the source is valid again. */ }
  };
  const applyScript = () => { try { setFormula(parsePine(source)); setActiveScript(scriptId); flash("Đã áp dụng chỉ báo lên biểu đồ"); } catch (cause) { flash(cause instanceof Error ? cause.message : "Mã không hợp lệ"); } };
  const saveScript = async () => {
    try {
      parsePine(source);
      const result = await persist({ action: "saveScript", id: scriptId || undefined, name: scriptName, source });
      const id = String(result.id);
      setScriptId(id);
      setScripts(current => [{ id, name: scriptName, source }, ...current.filter(script => script.id !== id)]);
      setFormula(parsePine(source)); setActiveScript(id); flash("Đã lưu và áp dụng chỉ báo");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Không lưu được chỉ báo"); }
  };
  const removeScript = async () => {
    if (!scriptId) return;
    try {
      await persist({ action: "deleteScript", id: scriptId });
      setScripts(current => current.filter(script => script.id !== scriptId));
      if (activeScript === scriptId) { setActiveScript(null); setFormula(null); }
      setScriptId(null); setScriptName("Chỉ báo của tôi"); setSource(SAMPLE); flash("Đã xóa chỉ báo");
    } catch (cause) { flash(cause instanceof Error ? cause.message : "Không xóa được chỉ báo"); }
  };

  if (ready && !me) return <main className="blocked"><Shield size={32}/><h1>Không thể mở biểu đồ</h1><p>{error || "Tài khoản của bạn chưa được cấp quyền."}</p></main>;

  return <main className="workspace">
    <header className="topbar">
      <div className="brand"><span className="brand-icon"><ChartCandlestick size={20}/></span><span>CHART<span className="brand-accent">LAB</span></span></div>
      <span className="top-divider"/><span className="product-label">BINANCE MARKETS</span><div className="top-grow"/>
      <button type="button" className="mobile-watch-button" onClick={() => openPanel("watchlist")}><List size={17}/><span>Watchlist</span></button>
      <span className={`status ${status === "Trực tiếp" ? "live" : ""}`}>{status === "Trực tiếp" ? <Wifi size={14}/> : <WifiOff size={14}/>} {status}</span>
      <span className="account" title={me?.role === "guest" ? "Dữ liệu lưu trong trình duyệt này" : me?.email}>{me?.role === "guest" ? "Khách · lưu trên thiết bị" : (me?.email || "Đang tải")}</span>
    </header>
    <div className="body-grid">
      <section className="main-column">
        <div className="toolbar">
          <div className="market-switch"><button className={market === "spot" ? "selected" : ""} onClick={() => changeMarket("spot")}>Spot</button><button className={market === "futures" ? "selected" : ""} onClick={() => changeMarket("futures")}><span className="desktop-market-label">Futures USDⓈ-M</span><span className="mobile-market-label">Futures</span></button></div>
          <div className="symbol-search" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) window.setTimeout(() => setPairOpen(false), 180); }}>
            <form className="symbol-form" onSubmit={event => { event.preventDefault(); submitPair(); }}><Activity size={16}/><input role="combobox" aria-label="Tìm cặp giao dịch Binance" aria-expanded={pairOpen} aria-controls="pair-results" autoComplete="off" value={symbolDraft} onFocus={event => { event.target.select(); setPairOpen(true); }} onChange={event => { setSymbolDraft(event.target.value.toUpperCase()); setPairOpen(true); }} onKeyDown={event => { if (event.key === "Escape") setPairOpen(false); }}/><button type="submit" aria-label="Mở cặp ưu tiên" title="Enter: ưu tiên cặp USDT">↵</button></form>
            {pairOpen && <div className="pair-results" id="pair-results" role="listbox" aria-label="Cặp giao dịch Binance">{pairLoading ? <p>Đang tải cặp Binance…</p> : matches.length ? matches.map(pair => <button type="button" role="option" aria-selected={pair.symbol === symbol} key={pair.symbol} onPointerDown={event => { event.preventDefault(); selectPair(pair); }} onClick={() => selectPair(pair)}><strong>{pair.baseAsset}<span>/{pair.quoteAsset}</span></strong><small>{pair.symbol} · Binance {market === "spot" ? "Spot" : "Futures"}</small></button>) : <p>{pairs.length ? "Không có cặp phù hợp trên Binance." : "Không tải được danh sách cặp; có thể nhập mã đầy đủ và nhấn Enter."}</p>}</div>}
          </div>
          <div className="timeframes">{FRAMES.map(frame => <button key={frame} className={interval === frame ? "selected" : ""} onClick={() => setInterval(frame)}>{frame}</button>)}</div>
          <div className="toolbar-spacer"/>
          <button className="icon-btn watch-add-button" onClick={addCurrentToWatchlist} title="Thêm cặp hiện tại vào watchlist"><Star size={18}/></button>
          <button className="icon-btn" onClick={() => openPanel("indicators")} title="Chỉ báo"><Settings2 size={18}/></button>
        </div>
        <div className="chart-heading"><div><div className="title-line"><strong>{symbol}</strong><span>{market === "spot" ? "Spot" : "Futures USDⓈ-M"}</span><span className="muted">·</span><span className="muted">{interval}</span></div><div className="ohlc">{shown ? <><span>O <b>{shown.open.toLocaleString("en-US")}</b></span><span>H <b>{shown.high.toLocaleString("en-US")}</b></span><span>L <b>{shown.low.toLocaleString("en-US")}</b></span><span>C <b className={shown.close >= shown.open ? "up" : "down"}>{shown.close.toLocaleString("en-US")}</b></span><span>V <b>{shown.volume.toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></span></> : "Đang lấy dữ liệu Binance…"}</div></div><span className="source-note">Nguồn: Binance · UTC</span></div>
        <div className="chart-area">{error && <div className="chart-error"><WifiOff size={17}/>{error}<button onClick={() => window.location.reload()} aria-label="Tải lại"><RefreshCw size={15}/></button></div>}<CandleChart key={dataKey} bars={visibleBars} enabled={enabled} settings={indicatorSettings} formula={formula} onNeedHistory={more} onHover={setHover}/></div>
        <div className="chart-footer"><span>Kéo để xem lịch sử · Chụm hoặc lăn để zoom · Chạm biểu đồ xem OHLCV</span><span>{visibleBars.length} nến · Nến cuối có thể chưa đóng</span></div>
      </section>
      <button type="button" aria-label="Đóng bảng điều khiển" className={`panel-overlay ${panelOpen ? "visible" : ""}`} onClick={() => setPanelOpen(false)}/>
      <aside className={`side-panel ${panelOpen ? "is-open" : ""}`}>
        <div className="panel-handle"/>
        <div className="panel-tabs">
          <button className={panel === "watchlist" ? "active" : ""} onClick={() => setPanel("watchlist")} title="Watchlist"><List size={18}/></button>
          <button className={panel === "indicators" ? "active" : ""} onClick={() => setPanel("indicators")} title="Chỉ báo"><Activity size={18}/></button>
          <button className={panel === "editor" ? "active" : ""} onClick={() => setPanel("editor")} title="Pine Script"><Code2 size={18}/></button>
          <button className={panel === "help" ? "active" : ""} onClick={() => setPanel("help")} title="Hướng dẫn"><CircleHelp size={18}/></button>
          <button className="panel-close" onClick={() => setPanelOpen(false)} title="Đóng"><X size={19}/></button>
        </div>
        {panel === "watchlist" && <div className="panel-content watchlist-content"><Watchlist groups={watchlists} activeGroupId={activeGroupId} currentMarket={market} currentSymbol={symbol} pairs={pairs} onActiveGroup={selectWatchGroup} onSelect={selectWatchItem} onAdd={addWatchItem} onRemove={removeWatchItem} onMove={moveWatchItem} onCreateGroup={createWatchGroup} onRenameGroup={renameWatchGroup} onDeleteGroup={deleteWatchGroup}/></div>}
        {panel === "indicators" && <div className="panel-content"><div className="panel-eyebrow">PHÂN TÍCH</div><h2>Chỉ báo</h2><p className="subtext">Bật chỉ báo hoặc chọn bánh răng để chỉnh tham số.</p><div className="indicator-list">{PALETTE.map(item => <div key={item.key}><div className={`indicator-row ${enabled[item.key] ? "is-on" : ""}`}><span className="indicator-mark" style={{ background: mark(item.key) }}/><button className="indicator-toggle" type="button" onClick={() => toggle(item.key)} aria-label={`${enabled[item.key] ? "Tắt" : "Bật"} ${item.title}`} aria-pressed={!!enabled[item.key]}><span className="indicator-copy"><strong>{item.title}</strong><small>{detail(item.key)}</small></span><span className="switch"><i/></span></button><button className={`indicator-gear ${expanded === item.key ? "active" : ""}`} type="button" aria-label={`Tùy chỉnh ${item.title}`} aria-expanded={expanded === item.key} onClick={() => setExpanded(expanded === item.key ? null : item.key)}><Settings2 size={17}/></button></div>{expanded === item.key && <IndicatorControls kind={item.key} settings={indicatorSettings} change={changeIndicator}/>}</div>)}</div><div className="panel-subhead">CHỈ BÁO CỦA TÔI <button onClick={() => { setScriptId(null); setScriptName("Chỉ báo của tôi"); setSource(SAMPLE); setPanel("editor"); }}>+ Tạo mới</button></div>{scripts.length ? scripts.map(script => <button key={script.id} className={`saved-script ${script.id === activeScript ? "is-active" : ""}`} onClick={() => { setScriptId(script.id); setScriptName(script.name); setSource(script.source); setPanel("editor"); }}><Code2 size={16}/><span>{script.name}</span><ChevronDown size={13}/></button>) : <p className="empty">Chưa có chỉ báo tùy chỉnh.</p>}{formula && <button className="text-action" onClick={() => { setFormula(null); setActiveScript(null); }}>Ẩn chỉ báo tùy chỉnh đang áp dụng</button>}</div>}
        {panel === "editor" && <div className="panel-content editor"><div className="panel-eyebrow">PINE SCRIPT · TẬP CON</div><h2>{active?.name || "Chỉ báo của tôi"}</h2><p className="subtext">Dán mã Pine đơn giản hoặc dùng tối đa 8 lệnh plot. Mỗi đường có màu riêng và được lưu cùng mã chỉ báo.</p><label className="field-label">Tên chỉ báo</label><Input value={scriptName} onChange={event => setScriptName(event.target.value)} maxLength={80}/><label className="field-label">Mã chỉ báo</label><textarea className="code-area" spellCheck={false} value={source} onChange={event => setSource(event.target.value)} aria-label="Mã Pine Script"/>{sourceProgram && <div className="custom-plot-colors"><span>MÀU TỪNG ĐƯỜNG PLOT</span>{sourceProgram.plots.map((plot,index)=><label className="custom-plot-color" key={plot.id}><input type="color" value={plot.color} aria-label={`Màu ${plot.title}`} onInput={event=>changePlotColor(index,event.currentTarget.value)} onChange={event=>changePlotColor(index,event.target.value)}/><strong>{plot.title}</strong><small>{plot.kind.toUpperCase()}</small></label>)}</div>}<p className="code-tip">Hỗ trợ: Pine v5/v6, indicator(), input.int/float(), tối đa 8 plot() với close/open/high/low/volume hoặc ta.sma, ta.ema, ta.rsi, ta.stdev.</p><div className="editor-actions"><Button onClick={saveScript}>Lưu & áp dụng</Button><Button variant="outline" onClick={applyScript}>Thử trên biểu đồ</Button></div>{scriptId && <button className="delete-action" onClick={removeScript}>Xóa chỉ báo này</button>}</div>}
        {panel === "help" && <div className="panel-content"><div className="panel-eyebrow">HƯỚNG DẪN</div><h2>Cách sử dụng</h2><p className="subtext">Ai có đường link đều xem được biểu đồ. Watchlist, chỉ báo tự tạo và thiết lập của khách lưu trên trình duyệt này.</p><ul className="help-list"><li>Gõ ETH để chọn ETH/USDT, ETH/USDC hoặc cặp khác đang giao dịch trên Binance.</li><li>Mở Watchlist để thêm, xóa, sắp xếp và chuyển nhanh giữa Spot/Futures.</li><li>Kéo để xem lịch sử; chụm hai ngón hoặc lăn chuột để zoom.</li><li>Bật chỉ báo và dùng bánh răng để chỉnh chu kỳ, nguồn giá, màu và độ dày.</li></ul><div className="limit-box"><strong>Giới hạn hiện tại</strong><p>Hỗ trợ một tập con Pine Script, không chạy được mọi script TradingView. Futures ở đây là USDⓈ-M.</p></div></div>}
        <div className="panel-bottom">CHARTLAB <span>·</span> dữ liệu Binance<br/>TradingView Lightweight Charts™ · Copyright © 2025 <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView, Inc.</a></div>
      </aside>
    </div>
    {notice && <div className="toast" role="status">{notice}</div>}
  </main>;
}
