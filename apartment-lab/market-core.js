/* Pure price-series and indicator logic, shared by the page and its tests. */
(function (root) {
  "use strict";
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const validMonth = value => typeof value === "string" && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
  const median = values => {
    const sorted = values.filter(finite).sort((a, b) => a - b), n = sorted.length;
    return n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null;
  };
  function periodDate(period) {
    if (validMonth(period)) return period + "-01";
    const quarter = /^(\d{4})-Q([1-4])$/.exec(period);
    if (quarter) return quarter[1] + "-" + String((Number(quarter[2]) - 1) * 3 + 1).padStart(2, "0") + "-01";
    if (/^\d{4}$/.test(period)) return period + "-01-01";
    if (/^\d{4}-\d{2}-\d{2}$/.test(period)) return period;
    return null;
  }
  function periodKey(period, frequency) {
    const date = periodDate(period);
    if (!date) return null;
    const year = date.slice(0, 4), month = Number(date.slice(5, 7));
    if (frequency === "Y1") return year;
    if (frequency === "Q1") return year + "-Q" + Math.ceil(month / 3);
    return date.slice(0, 7);
  }
  function nextPeriod(period, frequency) {
    const date = periodDate(period);
    if (!date) return null;
    const year = Number(date.slice(0, 4)), month = Number(date.slice(5, 7));
    if (frequency === "Y1") return String(year + 1);
    if (frequency === "Q1") {
      const quarter = Math.ceil(month / 3);
      return quarter === 4 ? (year + 1) + "-Q1" : year + "-Q" + (quarter + 1);
    }
    return month === 12 ? (year + 1) + "-01" : year + "-" + String(month + 1).padStart(2, "0");
  }
  function regularRows(points, frequency) {
    if (!["M1", "Q1", "Y1"].includes(frequency)) return [];
    const map = new Map();
    points.forEach(point => {
      const period = periodKey(point.period, frequency);
      if (!period || !finite(point.value) || point.value <= 0) return;
      const old = map.get(period);
      // Coarser views show the last available observation, never a fabricated OHLC.
      if (!old || periodDate(point.period) >= periodDate(old.originalPeriod)) {
        map.set(period, {...point, period, originalPeriod: point.period, date: periodDate(period)});
      }
    });
    const periods = [...map.keys()].sort((a, b) => periodDate(a).localeCompare(periodDate(b)));
    if (!periods.length) return [];
    const result = [];
    let period = periods[0], guard = 0;
    while (period && periodDate(period) <= periodDate(periods.at(-1)) && guard++ < 600) {
      result.push(map.get(period) || {period, date: periodDate(period), value: null, quality: "MISSING"});
      period = nextPeriod(period, frequency);
    }
    return result;
  }
  function projectSeries(project, history, frequency = "M1") {
    if (!project) return [];
    const records = history?.projects?.[project.id] || [];
    const map = new Map();
    records.forEach(row => {
      if (row.methodVersion === "PROJECT_UNIT_PRICE_V2" && validMonth(row.sourcePeriod) && finite(row.price)) {
        map.set(row.sourcePeriod, {period: row.sourcePeriod, value: row.price, sourceUrl: row.url, quality: "PROVIDER_STATISTIC"});
      }
    });
    if (project.methodVersion === "PROJECT_UNIT_PRICE_V2" && validMonth(project.sourcePeriod) && finite(project.price)) {
      map.set(project.sourcePeriod, {period: project.sourcePeriod, value: project.price, sourceUrl: project.url, quality: "PROVIDER_STATISTIC"});
    }
    return regularRows([...map.values()], frequency);
  }
  function basketSeries(symbol, frequency = "M1") {
    const points = (symbol?.history || []).filter(x =>
      x.methodVersion === "PROJECT_UNIT_PRICE_V2" && validMonth(x.sourcePeriod) && finite(x.price));
    return regularRows(points.map(x => ({period: x.sourcePeriod, value: x.price, quality: "FIXED_BASKET", projectCount: x.projectCount})), frequency);
  }
  function reportSeries(set, frequency) {
    let selected = frequency || set?.frequency || "M1";
    if (set?.frequency === "Q1" && selected === "M1") selected = "Q1";
    return regularRows(set?.points || [], selected);
  }
  function sma(values, length) {
    const result = Array(values.length).fill(null);
    let segment = [], sum = 0;
    values.forEach((value, index) => {
      if (!finite(value)) {segment = []; sum = 0; return;}
      segment.push(value); sum += value;
      if (segment.length > length) sum -= segment.shift();
      if (segment.length === length) result[index] = sum / length;
    });
    return result;
  }
  function ema(values, length) {
    const result = Array(values.length).fill(null), alpha = 2 / (length + 1);
    let seed = [], previous = null;
    values.forEach((value, index) => {
      if (!finite(value)) {seed = []; previous = null; return;}
      if (previous === null) {
        seed.push(value);
        if (seed.length < length) return;
        previous = seed.reduce((sum, x) => sum + x, 0) / length;
      } else previous = value * alpha + previous * (1 - alpha);
      result[index] = previous;
    });
    return result;
  }
  function bb(values, length, multiplier = 2) {
    const mid = sma(values, length), upper = mid.map(() => null), lower = mid.map(() => null);
    mid.forEach((value, index) => {
      if (!finite(value)) return;
      const sample = values.slice(index - length + 1, index + 1);
      const sd = Math.sqrt(sample.reduce((sum, x) => sum + (x - value) ** 2, 0) / length);
      upper[index] = value + multiplier * sd; lower[index] = value - multiplier * sd;
    });
    return {mid, upper, lower};
  }
  function rsi(values, length = 14) {
    const result = Array(values.length).fill(null);
    let previous = null, gain = 0, loss = 0, changes = 0;
    values.forEach((value, index) => {
      if (!finite(value)) {previous = null; gain = loss = changes = 0; return;}
      if (previous === null) {previous = value; return;}
      const delta = value - previous; previous = value;
      if (changes < length) {
        gain += Math.max(delta, 0); loss += Math.max(-delta, 0); changes++;
        if (changes < length) return;
        gain /= length; loss /= length;
      } else {
        gain = (gain * (length - 1) + Math.max(delta, 0)) / length;
        loss = (loss * (length - 1) + Math.max(-delta, 0)) / length;
      }
      result[index] = gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : gain === 0 ? 0 : 100 - 100 / (1 + gain / loss);
    });
    return result;
  }
  function macd(values) {
    const fast = ema(values, 12), slow = ema(values, 26);
    const line = values.map((_, i) => finite(fast[i]) && finite(slow[i]) ? fast[i] - slow[i] : null);
    const signal = ema(line, 9);
    return {line, signal, histogram: line.map((value, i) => finite(value) && finite(signal[i]) ? value - signal[i] : null)};
  }
  function indicatorInputs(rows) {
    // Estimates derived from another metric cannot become eligible observations.
    return rows.map(row => ["MISSING", "PROVIDER_ESTIMATE", "CALCULATED", "APPROX_DIGITIZED"].includes(row.quality) ? null : row.value);
  }
  function contiguousTail(values) {
    let count = 0;
    for (let i = values.length - 1; i >= 0 && finite(values[i]); i--) count++;
    return count;
  }
  function asLineData(rows, values) {
    return rows.map((row, index) => finite(values[index]) ? {time: row.date, value: values[index]} : {time: row.date});
  }
  function contiguousSegments(values) {
    const segments = [];
    values.forEach((value, index) => {
      if (!finite(value)) return;
      const last = segments.at(-1);
      if (last && last.to === index - 1) last.to = index;
      else segments.push({from: index, to: index});
    });
    return segments;
  }
  function safeSourceUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && ["onehousing.vn", "cdn.onehousing.vn", "research.batdongsan.com.vn", "wiki.batdongsan.com.vn", "batdongsan.com.vn", "www.cbre.com.vn", "cbre.com.vn"].includes(url.hostname) ? url.href : null;
    } catch {return null;}
  }
  function monthAge(period, today) {
    if (!validMonth(period)) return null;
    const date = today || new Date().toLocaleDateString("en-CA", {timeZone: "Asia/Ho_Chi_Minh"});
    const ym = /^(\d{4})-(\d{2})/.exec(date);
    if (!ym) return null;
    return (Number(ym[1]) - Number(period.slice(0, 4))) * 12 + Number(ym[2]) - Number(period.slice(5, 7));
  }
  const API = {finite, validMonth, median, periodDate, periodKey, nextPeriod, regularRows, projectSeries, basketSeries, reportSeries, sma, ema, bb, rsi, macd, indicatorInputs, contiguousTail, asLineData, contiguousSegments, safeSourceUrl, monthAge};
  if (typeof module === "object" && module.exports) module.exports = API;
  else root.GianhaCore = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
