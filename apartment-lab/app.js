/* gianha: source observations, separate providers, no synthetic candles. */
(() => {
  "use strict";
  const C = window.GianhaCore, $ = id => document.getElementById(id);
  const METHOD = "PROJECT_UNIT_PRICE_V2";
  const groups = [
    {id: "HN-APT-ALL", project: "Tất cả", report: "Toàn thị trường"},
    {id: "HN-APT-SEC", project: "Đã bàn giao", report: "Thứ cấp"},
    {id: "HN-APT-PRI", project: "Đang mở bán", report: "Sơ cấp"},
  ];
  const defaults = () => ({view: "projects", group: "HN-APT-ALL", instrument: "smart", timeframe: "M1",
    sma20: true, sma50: false, sma100: false, ema20: false, ema50: false, ema100: false,
    bb: false, rsi: true, macd: true, volume: false, bbLength: 20, bbMultiplier: 2, rsiLength: 14,
    rsiUpper: 70, rsiLower: 30, paneRatio: 65, rsiWeight: 1, macdWeight: 1,
    colors: {price: "#5dd4b6", sma20: "#edbf65", sma50: "#c58df0", sma100: "#8badff", ema20: "#ff9c66",
      ema50: "#ea84ae", ema100: "#7adae5", bbUpper: "#87aef2", bbMid: "#a1b1c8", bbLower: "#87aef2",
      rsi: "#c59afa", rsiUpper: "#ec858e", rsiLower: "#5dd4b6", macd: "#74b2ff", macdSignal: "#edbf65",
      macdUp: "#5dd4b6", macdDown: "#f17d86", volume: "#74b2ff"}});
  const bounds = {bbLength: [2, 200], bbMultiplier: [0.5, 5], rsiLength: [2, 100], rsiUpper: [51, 95], rsiLower: [5, 49], paneRatio: [35, 85], rsiWeight: [1, 5], macdWeight: [1, 5]};
  const storageKey = "gianha.preferences.v2";
  let prefs = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (saved) {
      Object.keys(prefs).forEach(key => {if (typeof prefs[key] === "boolean" && typeof saved[key] === "boolean") prefs[key] = saved[key];});
      ["view", "group", "instrument", "timeframe"].forEach(key => {if (typeof saved[key] === "string") prefs[key] = saved[key];});
      Object.entries(bounds).forEach(([key, [min, max]]) => {if (C.finite(saved[key])) prefs[key] = Math.min(max, Math.max(min, saved[key]));});
      Object.keys(prefs.colors).forEach(key => {if (/^#[0-9a-f]{6}$/i.test(saved.colors?.[key])) prefs.colors[key] = saved.colors[key];});
    }
  } catch { /* Blocked storage does not block the chart. */ }
  if (!["projects", "reports"].includes(prefs.view)) prefs.view = "projects";
  if (!groups.some(g => g.id === prefs.group)) prefs.group = groups[0].id;
  if (!["M1", "Q1", "Y1"].includes(prefs.timeframe)) prefs.timeframe = "M1";
  const save = () => {try {localStorage.setItem(storageKey, JSON.stringify(prefs));} catch { /* Session-only preferences. */ }};
  const fmt = (number, digits = 2) => C.finite(number) ? number.toLocaleString("vi-VN", {minimumFractionDigits: digits, maximumFractionDigits: digits}) : "—";
  const periodLabel = period => C.validMonth(period) ? `Tháng ${Number(period.slice(5))}/${period.slice(0, 4)}` : /^\d{4}-Q[1-4]$/.test(period || "") ? `Quý ${period.at(-1)}/${period.slice(0, 4)}` : period || "Chưa có kỳ dữ liệu";
  const dateLabel = value => {
    if (!value || !Number.isFinite(Date.parse(value))) return "chưa kiểm tra thành công";
    return new Date(value).toLocaleString("vi-VN", {timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric"});
  };
  const node = (tag, text, className) => {const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element;};
  const link = (url, text) => {const element = node("a", text), safe = C.safeSourceUrl(url); if (safe) {element.href = safe; element.target = "_blank"; element.rel = "noreferrer";} else {element.removeAttribute("href");} return element;};
  let live = null, history = null, reports = null, chart = null, current = null, loading = false, retainedError = "", panes = [];
  const filteredProjects = () => (live?.projects || []).filter(p => prefs.group === "HN-APT-ALL" || p.segment === (prefs.group === "HN-APT-PRI" ? "PRIMARY" : "SECONDARY"));
  const reportSymbol = () => reports?.symbols?.find(s => s.symbol === prefs.group);
  function setGroup(group) {
    prefs.group = group;
    prefs.instrument = prefs.view === "projects" ? "basket" : reportSymbol()?.referenceSets?.[0]?.id;
    render(true); save();
  }
  function renderControls() {
    document.querySelectorAll("[data-view]").forEach(button => {const active = button.dataset.view === prefs.view; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));});
    $("marketTabs").replaceChildren(...groups.map(group => {
      const button = node("button", prefs.view === "projects" ? group.project : group.report);
      const active = prefs.group === group.id; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
      button.addEventListener("click", () => setGroup(group.id)); return button;
    }));
    const choices = prefs.view === "projects" ? [{id: "basket", name: "Rổ dự án · trung vị cùng kỳ"}, ...filteredProjects()] : reportSymbol()?.referenceSets || [];
    if (!choices.some(x => x.id === prefs.instrument)) prefs.instrument = choices.find(x => x.id === "smart")?.id || choices[0]?.id;
    $("instrumentLabel").textContent = prefs.view === "projects" ? "Dự án / rổ" : "Chuỗi nguồn";
    $("instrumentSelect").replaceChildren(...choices.map(item => {const option = node("option", item.name); option.value = item.id; return option;}));
    $("instrumentSelect").value = prefs.instrument || "";
    const set = prefs.view === "reports" ? choices.find(x => x.id === prefs.instrument) : null;
    if (set?.frequency === "Q1" && prefs.timeframe === "M1") prefs.timeframe = "Q1";
    $("timeframes").replaceChildren(...[["W1", "Tuần"], ["M1", "Tháng"], ["Q1", "Quý"], ["Y1", "Năm"]].map(([key, label]) => {
      const button = node("button", label); button.disabled = key === "W1" || (key === "M1" && set?.frequency === "Q1");
      if (button.disabled) button.title = key === "W1" ? "Nguồn chưa có quan sát giá hàng tuần" : "Nguồn này công bố theo quý";
      button.classList.toggle("active", prefs.timeframe === key); button.setAttribute("aria-pressed", String(prefs.timeframe === key));
      button.addEventListener("click", () => {prefs.timeframe = key; render(true); save();}); return button;
    }));
  }
  function describeSeries() {
    if (prefs.view === "projects" && prefs.instrument !== "basket") {
      const project = live.projects.find(p => p.id === prefs.instrument);
      return {name: project.name, metric: "Đơn giá phổ biến của dự án · OneHousing", value: project.price, period: project.sourcePeriod,
        rows: C.projectSeries(project, history, prefs.timeframe), frequency: "M1", url: project.url,
        checkedAt: project.checkedAt, stale: project.status !== "VERIFIED", estimated: false,
        note: "Đây là thống kê đơn giá do nguồn công bố, không phải giá giao dịch của từng căn. Một kỳ có một điểm giá; lịch sử bắt đầu từ những kỳ đã lưu và kiểm chứng.", project};
    }
    if (prefs.view === "projects") {
      const basket = live.symbols[prefs.group], members = filteredProjects();
      return {name: `Rổ dự án · ${groups.find(g => g.id === prefs.group).project.toLowerCase()}`, metric: `Trung vị ${basket.expectedProjectCount} dự án · cùng kỳ nguồn`,
        value: basket.coherent ? basket.price : null, period: basket.sourcePeriod, rows: C.basketSeries(basket, prefs.timeframe), frequency: "M1",
        checkedAt: members.filter(p => p.checkedAt).map(p => p.checkedAt).sort()[0], stale: basket.staleProjectCount > 0, estimated: false,
        note: basket.coherent ? "Rổ cố định, mỗi dự án có trọng số bằng nhau. Đây là trung vị của các đơn giá phổ biến, không phải giá bình quân toàn Hà Nội."
          : `Chưa đủ rổ so sánh: ${basket.validProjectCount}/${basket.expectedProjectCount} dự án có giá, các kỳ nguồn: ${basket.periods.map(periodLabel).join(", ") || "chưa có"}. Giá rổ chỉ có khi đủ thành viên và cùng kỳ.`, basket};
    }
    const set = reportSymbol().referenceSets.find(s => s.id === prefs.instrument), last = set.points.filter(p => C.finite(p.value)).at(-1);
    return {name: reportSymbol().name, metric: set.name, value: last?.value, period: last?.period,
      rows: C.reportSeries(set, prefs.timeframe), frequency: set.frequency, url: last?.sourceUrl || set.sourceUrl,
      stale: false, estimated: last?.quality === "PROVIDER_ESTIMATE", note: `${set.coverage} ${set.note}`, set};
  }
  function renderQuote() {
    $("title").textContent = current.name; $("metricLabel").textContent = current.metric;
    $("last").textContent = fmt(current.value);
    $("periodLabel").textContent = periodLabel(current.period);
    let tag = prefs.view === "reports" ? (current.estimated ? "Giá dự kiến theo nguồn" : "Báo cáo tham khảo") : current.stale ? "Giữ giá lần kiểm tra trước" : "Giá theo nguồn";
    if (!C.finite(current.value)) tag = "Chưa đủ dữ liệu";
    const age = C.monthAge(current.period);
    if (prefs.view === "projects" && age >= 2 && !current.stale) tag = "Kỳ nguồn cũ";
    $("qualityTag").textContent = tag; $("qualityTag").classList.toggle("warning", current.stale || current.estimated || age >= 2 || !C.finite(current.value));
    $("sourceInfo").textContent = prefs.view === "projects" ? `Kiểm tra nguồn: ${dateLabel(current.checkedAt)} (giờ Việt Nam)` : "Kỳ công bố hiển thị cạnh giá · báo cáo công khai của nguồn";
    const safe = C.safeSourceUrl(current.url); $("sourceLink").hidden = !safe; if (safe) $("sourceLink").href = safe;
    $("dataNote").textContent = current.note + (prefs.timeframe !== current.frequency ? " Khung này dùng giá ghi nhận cuối kỳ, không phải giá bình quân của cả kỳ." : "");
    if (current.stale) $("dataNote").textContent += " Lần kiểm tra mới thất bại; giá và kỳ nguồn giữ nguyên lần thành công trước.";
    const meta = live.meta, minutes = (Date.now() - Date.parse(meta.lastAttemptAt)) / 60000;
    $("status").classList.toggle("warning", meta.status !== "OK" || minutes > 120 || Boolean(retainedError));
    $("status").textContent = retainedError ? "Chưa tải được bản mới" : meta.status !== "OK" ? `Nguồn thành công ${meta.successfulProjectCount}/${meta.expectedProjectCount}` : minutes > 120 ? "Đã quá 2 giờ chưa kiểm tra" : `Đã kiểm tra ${meta.successfulProjectCount} dự án · ${dateLabel(meta.lastAttemptAt)}`;
    $("loadError").hidden = !retainedError; $("loadError").textContent = retainedError;
  }
  function chartOptions() {
    const timeText = time => periodLabel(C.periodKey(typeof time === "string" ? time : `${time.year}-${String(time.month).padStart(2, "0")}-01`, prefs.timeframe));
    return {autoSize: true, layout: {background: {color: "#0a111a"}, textColor: "#a6b9cd", fontSize: 12, panes: {enableResize: true, separatorColor: "#293e56", separatorHoverColor: "#5a7e9f"}},
      grid: {vertLines: {color: "#172537"}, horzLines: {color: "#172537"}}, rightPriceScale: {borderColor: "#29394c", minimumWidth: 64},
      timeScale: {borderColor: "#29394c", timeVisible: false, rightOffset: 3, tickMarkFormatter: timeText},
      localization: {locale: "vi-VN", priceFormatter: value => fmt(value), timeFormatter: timeText},
      crosshair: {mode: LightweightCharts.CrosshairMode.Normal}, handleScroll: {vertTouchDrag: false}};
  }
  function line(values, color, title, pane = 0, options = {}) {
    // Lightweight Charts joins LineSeries across whitespace. Separate each
    // contiguous segment so the display cannot imply prices in missing periods.
    const segments = C.contiguousSegments(values);
    if (!segments.length) segments.push({from: -1, to: -1});
    let latest;
    segments.forEach((segment, index) => {
      const isLast = index === segments.length - 1;
      latest = chart.addSeries(LightweightCharts.LineSeries, {color, title: isLast ? title : "", lineWidth: 2, lastValueVisible: false, priceLineVisible: false, ...options, ...(isLast ? {} : {lastValueVisible: false})}, pane);
      latest.setData(C.asLineData(current.rows, values.map((value, i) => i >= segment.from && i <= segment.to ? value : null)));
    });
    return latest;
  }
  function applyPaneSizes() {
    if (!chart || panes.length < 2) return;
    const available = chart.panes(), ratio = prefs.paneRatio / 100;
    const weights = panes.slice(1).map(name => name === "rsi" ? prefs.rsiWeight : name === "macd" ? prefs.macdWeight : 1);
    available[0].setStretchFactor(ratio);
    available.slice(1).forEach((pane, i) => pane.setStretchFactor((1 - ratio) * weights[i] / weights.reduce((sum, x) => sum + x, 0)));
  }
  function renderChart(reset) {
    const range = !reset && chart ? chart.timeScale().getVisibleLogicalRange() : null;
    if (chart) chart.remove(); chart = null; panes = [];
    const rows = current.rows, values = C.indicatorInputs(rows), n = C.contiguousTail(values);
    const actualCount = rows.filter(r => C.finite(r.value)).length;
    $("chartHead").textContent = `${current.metric} · ${actualCount} kỳ có giá`;
    $("historyInfo").textContent = rows.length ? `${periodLabel(rows[0].originalPeriod || rows[0].period)} → ${periodLabel(rows.at(-1).originalPeriod || rows.at(-1).period)} · ${rows.length - actualCount} kỳ thiếu dữ liệu` : "Chưa có lịch sử hợp lệ của chuỗi này";
    const empty = actualCount === 0;
    $("emptyChart").hidden = !empty;
    $("emptyChart").replaceChildren(node("p", "Chưa có đủ dữ liệu để vẽ chuỗi này. Giá rổ cần đủ thành viên cùng kỳ; có thể chọn một dự án để xem giá có nguồn."));
    renderSignals(values, n);
    if (!window.LightweightCharts) {$("emptyChart").hidden = false; $("emptyChart").replaceChildren(node("p", "Không tải được thư viện biểu đồ. Giá và nguồn vẫn có trong bảng bên dưới.")); return;}
    chart = LightweightCharts.createChart($("priceChart"), chartOptions()); panes = ["price"];
    const observed = rows.map(r => r.quality === "PROVIDER_ESTIMATE" ? null : r.value);
    const priceSeries = line(observed, prefs.colors.price, "Giá", 0, {pointMarkersVisible: true, pointMarkersRadius: 3, lastValueVisible: true, priceLineVisible: false});
    const estimates = rows.map(r => r.quality === "PROVIDER_ESTIMATE" ? r.value : null);
    if (estimates.some(C.finite)) line(estimates, "#efbf72", "Dự kiến", 0, {pointMarkersVisible: true, pointMarkersRadius: 5, lineStyle: 2});
    [20, 50, 100].forEach(length => ["sma", "ema"].forEach(kind => {
      const key = kind + length; if (!prefs[key]) return;
      const result = C[kind](values, length); if (result.some(C.finite)) line(result, prefs.colors[key], `${kind.toUpperCase()} ${length}`);
    }));
    if (prefs.bb) {
      const result = C.bb(values, Math.round(prefs.bbLength), prefs.bbMultiplier);
      if (result.mid.some(C.finite)) [["upper", "bbUpper"], ["mid", "bbMid"], ["lower", "bbLower"]].forEach(([key, color]) => line(result[key], prefs.colors[color], "BB " + key, 0, {lineWidth: 1}));
    }
    if (prefs.rsi) {
      const result = C.rsi(values, Math.round(prefs.rsiLength));
      if (result.some(C.finite)) {
        const pane = panes.length; panes.push("rsi");
        const series = line(result, prefs.colors.rsi, `RSI ${Math.round(prefs.rsiLength)}`, pane, {lastValueVisible: true, priceFormat: {type: "price", precision: 1, minMove: 0.1}});
        series.createPriceLine({price: prefs.rsiUpper, color: prefs.colors.rsiUpper, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Cao"});
        series.createPriceLine({price: prefs.rsiLower, color: prefs.colors.rsiLower, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: "Thấp"});
      }
    }
    if (prefs.macd) {
      const result = C.macd(values);
      if (result.line.some(C.finite)) {
        const pane = panes.length; panes.push("macd");
        const histogram = chart.addSeries(LightweightCharts.HistogramSeries, {title: "MACD hist", priceLineVisible: false, lastValueVisible: false}, pane);
        histogram.setData(rows.map((r, i) => C.finite(result.histogram[i]) ? {time: r.date, value: result.histogram[i], color: result.histogram[i] >= 0 ? prefs.colors.macdUp : prefs.colors.macdDown} : {time: r.date}));
        line(result.line, prefs.colors.macd, "MACD", pane); line(result.signal, prefs.colors.macdSignal, "Signal", pane, {lineWidth: 1});
      }
    }
    if (prefs.volume && prefs.view === "reports") {
      const matching = (reportSymbol().weeklyVolume || []).filter(v => C.finite(v.value) && rows.some(r => r.period === C.periodKey(v.date, prefs.timeframe) && C.finite(r.value)));
      if (matching.length) {
        const pane = panes.length; panes.push("volume");
        const series = chart.addSeries(LightweightCharts.HistogramSeries, {title: "Tin rao", color: prefs.colors.volume, priceFormat: {type: "volume"}, priceLineVisible: false}, pane);
        const map = new Map(matching.map(v => [C.periodKey(v.date, prefs.timeframe), v]));
        series.setData(rows.map(r => map.has(r.period) ? {time: r.date, value: map.get(r.period).value} : {time: r.date}));
      }
    }
    applyPaneSizes();
    if (range) chart.timeScale().setVisibleLogicalRange(range);
    else if (rows.length <= 2 && rows.length) chart.timeScale().setVisibleLogicalRange({from: -2, to: rows.length + 2});
    else chart.timeScale().fitContent();
    const base = $("chartHead").textContent;
    chart.subscribeCrosshairMove(param => {
      if (!param.time) {$("chartHead").textContent = base; return;}
      const point = param.seriesData.get(priceSeries), row = rows.find(r => r.date === param.time);
      $("chartHead").textContent = row ? `${periodLabel(row.originalPeriod || row.period)} · ${fmt(point?.value ?? row.value)} triệu/m²${row.quality === "PROVIDER_ESTIMATE" ? " · dự kiến" : row.quality === "APPROX_DIGITIZED" ? " · ước đọc" : ""}` : base;
    });
  }
  function signal(title, text) {const card = node("div", undefined, "signalCard"); card.append(node("b", title), node("p", text)); return card;}
  function renderSignals(values, n) {
    const cards = [signal("Độ dài dữ liệu", `${n} kỳ liên tiếp đủ điều kiện ở cuối chuỗi. Không dùng điểm dự kiến, ước đọc, suy ra hoặc kỳ thiếu để tính chỉ báo.`)];
    if (prefs.rsi) {
      const length = Math.round(prefs.rsiLength), last = C.rsi(values, length).at(-1);
      cards.push(signal(`RSI ${length}`, C.finite(last) ? `${fmt(last, 1)} · ${periodLabel(current.rows.at(-1)?.originalPeriod || current.rows.at(-1)?.period)}. Phản ánh chuỗi giá định kỳ, không phải tín hiệu mua bán trong ngày.` : `Cần ít nhất ${length + 1} kỳ liên tiếp; hiện có ${n}.`));
    }
    if (prefs.macd) {
      const result = C.macd(values), last = result.histogram.at(-1);
      cards.push(signal("MACD 12 / 26 / 9", C.finite(last) ? `Histogram ${fmt(last)} triệu/m². Chỉ dùng tham khảo với đúng kỳ và nguồn đang chọn.` : `Cần ít nhất 34 kỳ liên tiếp cho đủ MACD và đường tín hiệu; hiện có ${n}.`));
    }
    const selected = [20, 50, 100].filter(length => prefs["sma" + length] || prefs["ema" + length]);
    if (selected.length) cards.push(signal("Đường trung bình", selected.map(length => `${length} kỳ: ${n >= length ? "đủ dữ liệu" : `thiếu ${length - n} kỳ`}`).join(" · ")));
    if (prefs.bb) cards.push(signal(`Bollinger ${Math.round(prefs.bbLength)}`, n >= prefs.bbLength ? "Biên theo độ lệch chuẩn của chuỗi này; không dự báo giá." : `Cần ${Math.round(prefs.bbLength)} kỳ liên tiếp; hiện có ${n}.`));
    if (prefs.volume) cards.push(signal("Số tin rao", "Chỉ vẽ số tin thực sự ghi nhận trong cùng kỳ với chuỗi giá. Số tin có thể trùng lặp; không phải khối lượng giao dịch. Không bù các kỳ thiếu bằng 0."));
    $("signals").replaceChildren(...cards);
  }
  function renderTables() {
    $("coverage").textContent = `${live.meta.successfulProjectCount}/${live.meta.expectedProjectCount} nguồn kiểm tra thành công`;
    $("projectRows").replaceChildren(...live.projects.map(project => {
      const row = node("tr"), name = node("td"), button = node("button", project.name, "projectName");
      button.addEventListener("click", () => {prefs.view = "projects"; prefs.group = "HN-APT-ALL"; prefs.instrument = project.id; render(true); save(); $("title").scrollIntoView({behavior: "auto", block: "start"});});
      name.append(button); if (project.status !== "VERIFIED") name.append(node("span", "Lần kiểm tra mới thất bại", "rowStatus"));
      const change = node("td"), pct = project.changePct;
      change.append(node("span", C.finite(pct) ? `${pct > 0 ? "+" : ""}${fmt(pct)}%` : "Chưa có", C.finite(pct) && pct !== 0 ? pct > 0 ? "positive" : "negative" : ""));
      change.append(node("span", project.changePeriod === "quarter" ? "so với quý trước" : project.changePeriod === "month" ? "so với tháng trước" : "kỳ so sánh chưa rõ", "changeDetail"));
      const source = node("td"); source.append(link(project.url, "OneHousing"));
      row.append(name, node("td", fmt(project.price)), node("td", periodLabel(project.sourcePeriod)), change, source); return row;
    }));
    $("watchList").replaceChildren(...groups.map(group => {
      const basket = live.symbols[group.id], button = node("button", undefined, "witem");
      button.classList.toggle("active", prefs.group === group.id);
      const left = node("div"); left.append(node("strong", `Rổ · ${group.project}`), node("span", `${basket.validProjectCount}/${basket.expectedProjectCount} dự án · ${periodLabel(basket.sourcePeriod)}`));
      const right = node("div"); right.append(node("strong", fmt(basket.coherent ? basket.price : null)), node("span", "triệu/m²"));
      button.append(left, right); button.addEventListener("click", () => {prefs.view = "projects"; setGroup(group.id);}); return button;
    }));
  }
  function render(reset = false) {
    if (!live || !reports) return;
    renderControls(); current = describeSeries(); renderQuote(); renderChart(reset); renderTables();
  }
  function indicatorControls() {
    const makeGroup = title => {const group = node("section", undefined, "indicatorGroup"); group.append(node("h3", title)); $("indicatorControls").append(group); return group;};
    $("indicatorControls").replaceChildren();
    const colorInput = (container, key, labelText) => {
      const label = node("label", labelText, "colorRow"), input = node("input"); input.type = "color"; input.value = prefs.colors[key]; input.setAttribute("aria-label", labelText);
      input.addEventListener("input", () => {prefs.colors[key] = input.value; save(); renderChart(false);}); label.append(input); container.append(label);
    };
    const toggle = (container, key, labelText, color) => {
      const row = node("div", undefined, "indicatorRow"), label = node("label"), input = node("input"); input.type = "checkbox"; input.checked = prefs[key];
      input.addEventListener("change", () => {prefs[key] = input.checked; save(); renderChart(false);}); label.append(input, document.createTextNode(labelText)); row.append(label);
      if (color) {const colorLabel = node("label", "", "colorRow"), colorField = node("input"); colorField.type = "color"; colorField.value = prefs.colors[color]; colorField.setAttribute("aria-label", "Màu " + labelText); colorLabel.style.flex = "0"; colorLabel.style.minWidth = "auto"; colorLabel.append(colorField); row.append(colorLabel); colorField.addEventListener("input", () => {prefs.colors[color] = colorField.value; save(); renderChart(false);});}
      container.append(row);
    };
    const numberInput = (container, key, labelText, step = 1) => {
      const label = node("label", labelText, "colorRow"), input = node("input"); input.type = "number"; input.min = bounds[key][0]; input.max = bounds[key][1]; input.step = step; input.value = prefs[key]; input.setAttribute("aria-label", labelText);
      input.addEventListener("change", () => {const value = Number(input.value); prefs[key] = Number.isFinite(value) ? Math.min(bounds[key][1], Math.max(bounds[key][0], step === 1 ? Math.round(value) : value)) : defaults()[key]; input.value = prefs[key]; save(); renderChart(false);}); label.append(input); container.append(label);
    };
    colorInput(makeGroup("Giá"), "price", "Màu đường giá");
    ["sma", "ema"].forEach(kind => {const group = makeGroup(kind.toUpperCase()); [20, 50, 100].forEach(length => toggle(group, kind + length, `${kind.toUpperCase()} ${length}`, kind + length));});
    const bb = makeGroup("Bollinger Bands"); toggle(bb, "bb", "Hiển thị Bollinger"); numberInput(bb, "bbLength", "Độ dài Bollinger"); numberInput(bb, "bbMultiplier", "Hệ số độ lệch chuẩn", 0.5); [["bbUpper", "Màu biên trên"], ["bbMid", "Màu đường giữa"], ["bbLower", "Màu biên dưới"]].forEach(([key, label]) => colorInput(bb, key, label));
    const rsi = makeGroup("RSI"); toggle(rsi, "rsi", "Hiển thị RSI", "rsi"); numberInput(rsi, "rsiLength", "Độ dài RSI"); numberInput(rsi, "rsiUpper", "Ngưỡng RSI cao"); numberInput(rsi, "rsiLower", "Ngưỡng RSI thấp"); colorInput(rsi, "rsiUpper", "Màu ngưỡng cao"); colorInput(rsi, "rsiLower", "Màu ngưỡng thấp");
    const macd = makeGroup("MACD"); toggle(macd, "macd", "Hiển thị MACD", "macd"); [["macdSignal", "Màu đường tín hiệu"], ["macdUp", "Màu histogram tăng"], ["macdDown", "Màu histogram giảm"]].forEach(([key, label]) => colorInput(macd, key, label));
    const volume = makeGroup("Hoạt động tin rao"); toggle(volume, "volume", "Số tin rao có nguồn", "volume"); volume.append(node("p", "Không phải khối lượng giao dịch. Chỉ xuất hiện khi có dữ liệu tin rao trong kỳ của chuỗi đang chọn.", "dialogHelp"));
    Object.keys(bounds).filter(key => ["paneRatio", "rsiWeight", "macdWeight"].includes(key)).forEach(key => {$(key).value = prefs[key];}); $("paneRatioValue").value = prefs.paneRatio + "%";
  }
  async function readJSON(path) {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {const response = await fetch(`${path}?check=${Date.now()}`, {cache: "no-store", signal: controller.signal}); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json();} finally {clearTimeout(timeout);}
  }
  async function loadData(initial = false) {
    if (loading) return; loading = true; $("refreshBtn").disabled = true; $("refreshBtn").textContent = "Đang tải…";
    try {
      const [nextLive, nextHistory, nextReports] = await Promise.all([readJSON("./data/live-market.json"), readJSON("./data/live-history.json"), readJSON("./data/market-indices.json")]);
      if (nextLive.meta?.methodVersion !== METHOD || !Array.isArray(nextLive.projects) || !nextLive.symbols || nextReports.meta?.schemaVersion !== 2 || !Array.isArray(nextReports.symbols)) throw new Error("Dữ liệu chưa đúng phiên bản");
      const consistent = nextHistory.meta?.methodVersion === METHOD && nextHistory.meta.lastAttemptAt === nextLive.meta.lastAttemptAt;
      retainedError = consistent ? "" : "Bản giá và lịch sử chưa đồng bộ. Đang hiển thị giá có nguồn; lịch sử sẽ tải lại ở lần cập nhật sau.";
      live = nextLive; history = consistent ? nextHistory : {projects: {}}; reports = nextReports; render(initial);
    } catch (error) {
      retainedError = "Không tải được dữ liệu mới. " + (live ? "Đang giữ bản đã tải; xem thời điểm kiểm tra nguồn bên cạnh giá." : "Hãy thử nút Cập nhật hoặc tải lại trang.");
      if (live) render(false); else {$("loadError").hidden = false; $("loadError").textContent = retainedError; $("status").textContent = "Chưa tải được dữ liệu"; $("title").textContent = "Chưa có dữ liệu để hiển thị";}
    } finally {
      loading = false; $("refreshBtn").disabled = false; $("refreshBtn").textContent = "Cập nhật";
      document.querySelectorAll('[data-view], #instrumentSelect, #fitBtn, #latestBtn, #indBtn').forEach(element => {element.disabled = !live;});
    }
  }
  document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {if (!live) return; prefs.view = button.dataset.view; prefs.instrument = prefs.view === "projects" ? "smart" : reportSymbol()?.referenceSets?.[0]?.id; render(true); save();}));
  $("instrumentSelect").addEventListener("change", event => {prefs.instrument = event.target.value; render(true); save();});
  $("refreshBtn").addEventListener("click", () => loadData());
  $("fitBtn").addEventListener("click", () => {if (chart) {if (current.rows.length <= 2) chart.timeScale().setVisibleLogicalRange({from: -2, to: current.rows.length + 2}); else chart.timeScale().fitContent();}});
  $("latestBtn").addEventListener("click", () => {if (chart) chart.timeScale().setVisibleLogicalRange({from: Math.max(-2, current.rows.length - 24), to: current.rows.length + 2});});
  $("indBtn").addEventListener("click", () => {indicatorControls(); $("indDialog").showModal();});
  $("closeIndBtn").addEventListener("click", () => $("indDialog").close());
  $("indDialog").addEventListener("click", event => {if (event.target === $("indDialog")) {const rect = $("indDialog").getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $("indDialog").close();}});
  $("resetBtn").addEventListener("click", () => {const selection = {view: prefs.view, group: prefs.group, instrument: prefs.instrument, timeframe: prefs.timeframe}; prefs = {...defaults(), ...selection}; indicatorControls(); render(false); save();});
  ["paneRatio", "rsiWeight", "macdWeight"].forEach(key => $(key).addEventListener("input", () => {prefs[key] = Number($(key).value); $("paneRatioValue").value = prefs.paneRatio + "%"; applyPaneSizes(); save();}));
  $("priceChart").addEventListener("pointerup", () => {
    if (!chart || panes.length < 2) return;
    requestAnimationFrame(() => {if (!chart) return; const heights = chart.panes().map(p => p.getHeight()), sum = heights.reduce((a, b) => a + b, 0); if (!sum) return; prefs.paneRatio = Math.min(85, Math.max(35, 100 * heights[0] / sum)); const min = Math.min(...heights.slice(1)); if (min > 0) panes.forEach((name, i) => {if (name === "rsi" || name === "macd") prefs[name + "Weight"] = Math.min(5, Math.max(1, heights[i] / min));}); save();});
  }, true);
  new ResizeObserver(() => {if (chart) applyPaneSizes();}).observe($("priceChart"));
  document.addEventListener("visibilitychange", () => {if (!document.hidden) loadData();});
  window.addEventListener("online", () => loadData());
  setInterval(() => {if (!document.hidden) loadData();}, 5 * 60 * 1000);
  loadData(true);
})();
