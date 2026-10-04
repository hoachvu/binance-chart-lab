#!/usr/bin/env python3
"""Collect public project prices without inventing market prices or observations."""
import argparse
import json
import math
import os
import re
import statistics
import tempfile
import time
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "apartment-lab" / "data"
CONFIG = DATA_DIR / "project-config.json"
OUT = DATA_DIR / "live-market.json"
HISTORY_OUT = DATA_DIR / "live-history.json"
METHOD_VERSION = "PROJECT_UNIT_PRICE_V2"
TZ = ZoneInfo("Asia/Ho_Chi_Minh")
# This is a sanity bound, not a rule to silently clamp valid prices.
MIN_PRICE, MAX_PRICE = 10, 1000

class VisibleText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.skip += 1

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)

def text_of(html):
    parser = VisibleText()
    parser.feed(html)
    return re.sub(r"\s+", " ", " ".join(parser.parts)).strip()

def decimal_number(raw):
    """Decimal-price fields accept . or ,; they never use grouping separators."""
    value = str(raw).strip().replace("\u2212", "-").replace("\xa0", "")
    if not re.fullmatch(r"[+-]?\d+(?:[.,]\d{1,4})?", value):
        raise ValueError("Định dạng số thập phân không rõ ràng")
    number = float(value.replace(",", "."))
    if not math.isfinite(number):
        raise ValueError("Giá trị không hữu hạn")
    return number

def parse_project_text(config, text, checked_at):
    text = re.sub(r"\s+", " ", text)
    match = re.search(
        r"Đơn giá phổ biến.{0,300}?([+-]?\d+(?:[.,]\d{1,4})?)\s*"
        r"triệu\s*/\s*m[²2]\s*([+\-\u2212]?\d+(?:[.,]\d{1,4})?)?\s*%?",
        text, re.I,
    )
    if not match:
        raise ValueError("Không tìm thấy đơn giá phổ biến công khai")
    value = decimal_number(match.group(1))
    if not MIN_PRICE <= value <= MAX_PRICE:
        raise ValueError(f"Đơn giá ngoài khoảng kiểm tra: {value:g} triệu/m²")
    # The period must come from the price section, not the collection date.
    prefix = text[max(0, match.start() - 650):match.start()]
    periods = list(re.finditer(r"tháng\s*(0?[1-9]|1[0-2])\s*/\s*(20\d{2})", prefix, re.I))
    if not periods:
        raise ValueError("Không xác định được kỳ dữ liệu của giá")
    period_match = periods[-1]
    period = f"{period_match.group(2)}-{int(period_match.group(1)):02d}"
    checked_month = checked_at[:7]
    if period > checked_month:
        raise ValueError("Kỳ dữ liệu nằm trong tương lai")
    change = decimal_number(match.group(2)) if match.group(2) else None
    if change is not None and not -100 < change < 100:
        raise ValueError("Biến động giá ngoài khoảng kiểm tra")
    comparison = re.search(r"so với\s+(tháng|quý)\s+trước", text[match.end():match.end() + 650], re.I)
    return {
        **config, "price": round(value, 4), "sourcePeriod": period,
        "rawPrice": match.group(1), "changePct": change,
        "changePeriod": ("month" if comparison.group(1).lower() == "tháng" else "quarter") if comparison else None,
        "source": "OneHousing", "metric": "PROJECT_POPULAR_UNIT_PRICE",
        "unit": "million_VND_per_m2", "checkedAt": checked_at,
        "lastAttemptAt": checked_at, "status": "VERIFIED",
        "methodVersion": METHOD_VERSION,
    }

def parse_project_html(config, html, checked_at):
    return parse_project_text(config, text_of(html), checked_at)

def fetch_html(url):
    # Do not retry access denials or human-verification pages.
    for attempt in range(2):
        try:
            request = Request(url, headers={
                "User-Agent": "gianha/0.13 (+public-price-monitor)",
                "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.7",
            })
            with urlopen(request, timeout=20) as response:
                charset = response.headers.get_content_charset() or "utf-8"
                html = response.read().decode(charset, errors="replace")
            if re.search(r"<title[^>]*>\s*(?:Just a moment|Access Denied|Attention Required)", html, re.I):
                raise ValueError("Nguồn yêu cầu xác minh truy cập")
            return html
        except HTTPError as exc:
            if exc.code in (401, 403, 429) or attempt:
                raise
        except (TimeoutError, OSError):
            if attempt:
                raise
        time.sleep(1)
    raise OSError("Không tải được nguồn")

def load_json(path, default):
    if not path.exists():
        return default
    # Corrupt history must not be quietly overwritten with an empty history.
    return json.loads(path.read_text(encoding="utf-8"))

def valid_previous(row):
    value = row.get("price")
    return (
        row.get("methodVersion") == METHOD_VERSION
        and isinstance(value, (int, float)) and not isinstance(value, bool)
        and math.isfinite(value) and MIN_PRICE <= value <= MAX_PRICE
        and re.fullmatch(r"20\d{2}-(?:0[1-9]|1[0-2])", row.get("sourcePeriod", "")) is not None
    )

def retain_on_error(config, previous, checked_at, error):
    message = str(error).replace("\n", " ")[:200]
    if previous and valid_previous(previous):
        return {
            **previous, **config, "status": "STALE_FETCH_ERROR",
            "lastAttemptAt": checked_at, "error": message,
            # checkedAt and sourcePeriod intentionally remain the last success.
        }
    return {
        **config, "price": None, "sourcePeriod": None, "checkedAt": None,
        "lastAttemptAt": checked_at, "status": "UNAVAILABLE",
        "error": message, "methodVersion": METHOD_VERSION,
    }

def clean_history(previous):
    if previous.get("meta", {}).get("methodVersion") == METHOD_VERSION:
        return previous
    return {
        "meta": {"version": 2, "methodVersion": METHOD_VERSION},
        "projects": {},
        "migration": {
            "discardedLegacyNowcast": True,
            "reason": "V1 used calibrated market anchors and a different number parser; it is incompatible with observed project prices.",
        },
    }

def upsert_project_history(history, row):
    if row.get("status") != "VERIFIED" or not valid_previous(row):
        return
    observations = history.setdefault("projects", {}).setdefault(row["id"], [])
    period = row["sourcePeriod"]
    observations[:] = [x for x in observations if x.get("sourcePeriod") != period]
    observations.append({
        "sourcePeriod": period, "price": row["price"],
        "checkedAt": row["checkedAt"], "source": row["source"],
        "url": row["url"], "metric": row["metric"],
        "methodVersion": METHOD_VERSION,
    })
    observations.sort(key=lambda x: x["sourcePeriod"])
    # One observation per SOURCE month, not one artificial observation per day.
    if len(observations) > 240:
        del observations[:-240]

def basket_history(configs, history):
    """Same fixed member set and same source month are required for every point."""
    members = [c["id"] for c in configs]
    if not members:
        return []
    mappings = {
        member: {x["sourcePeriod"]: x for x in history.get("projects", {}).get(member, [])
                 if valid_previous(x)}
        for member in members
    }
    common = set.intersection(*(set(x) for x in mappings.values()))
    return [{
        "sourcePeriod": period,
        "price": round(statistics.median(mappings[member][period]["price"] for member in members), 4),
        "projectCount": len(members), "members": members,
        "metric": "FIXED_PROJECT_BASKET_MEDIAN",
        "methodVersion": METHOD_VERSION,
    } for period in sorted(common)]

def summarize(configs, projects, history):
    valid = [row for row in projects if valid_previous(row)]
    periods = sorted({r["sourcePeriod"] for r in valid})
    complete = len(valid) == len(configs) and bool(valid)
    coherent = complete and len(periods) == 1
    stale_count = sum(row.get("status") != "VERIFIED" for row in projects)
    return {
        "snapshotMedian": round(statistics.median(r["price"] for r in valid), 4) if valid else None,
        "price": round(statistics.median(r["price"] for r in valid), 4) if coherent else None,
        "sourcePeriod": periods[0] if coherent else None,
        "periods": periods, "validProjectCount": len(valid),
        "expectedProjectCount": len(configs), "staleProjectCount": stale_count,
        "coherent": coherent, "metric": "FIXED_PROJECT_BASKET_MEDIAN",
        "methodVersion": METHOD_VERSION, "history": basket_history(configs, history),
        "note": "Equal-weight median of project popular unit prices; not a Hanoi-wide transaction-price average. Project-stage groups are proxies, not a verified primary/secondary transaction classification.",
    }

def build_snapshot(configs, rows, history, checked_at):
    for row in rows:
        upsert_project_history(history, row)
    history["meta"] = {
        "version": 2, "methodVersion": METHOD_VERSION,
        "lastAttemptAt": checked_at, "cadence": "one record per source month",
        "note": "Repeated collection of the same source month does not create additional time observations.",
    }
    groups = {
        "HN-APT-ALL": configs,
        "HN-APT-SEC": [c for c in configs if c["segment"] == "SECONDARY"],
        "HN-APT-PRI": [c for c in configs if c["segment"] == "PRIMARY"],
    }
    symbols = {}
    for symbol, members in groups.items():
        ids = {c["id"] for c in members}
        symbols[symbol] = summarize(members, [r for r in rows if r["id"] in ids], history)
    success_count = sum(r.get("status") == "VERIFIED" for r in rows)
    successful_times = [r["checkedAt"] for r in rows if valid_previous(r) and r.get("checkedAt")]
    return {
        "meta": {
            "version": 2, "methodVersion": METHOD_VERSION,
            "lastAttemptAt": checked_at,
            "lastSuccessfulCheckAt": max(successful_times) if successful_times else None,
            "cadence": "hourly source checks; source prices are periodic",
            "status": "OK" if success_count == len(configs) else "PARTIAL" if success_count else "SOURCE_ERROR",
            "successfulProjectCount": success_count, "expectedProjectCount": len(configs),
            "source": "OneHousing public project pages",
            "unit": "million_VND_per_m2",
            "method": "Public popular unit prices, stored with their actual source period. No fixed market-price calibration, no interpolated candles.",
        },
        "projects": rows, "symbols": symbols,
    }

def atomic_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp_path = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write("\n")
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verified-input", type=Path, help="Seed from already verified public-page captures.")
    args = parser.parse_args()
    configs = load_json(CONFIG, [])
    if not configs or len({c["id"] for c in configs}) != len(configs):
        raise ValueError("Danh sách dự án thiếu hoặc trùng mã")
    checked_at = datetime.now(TZ).isoformat(timespec="seconds")
    previous = load_json(OUT, {})
    history = clean_history(load_json(HISTORY_OUT, {}))
    old_rows = {r["id"]: r for r in previous.get("projects", [])}
    captures = {r["id"]: r for r in load_json(args.verified_input, [])} if args.verified_input else None
    rows = []
    for config in configs:
        try:
            if captures is not None:
                capture = captures[config["id"]]
                period = capture["sourcePeriod"]
                # Feed the same parser as the HTTP route, so validations stay identical.
                text = f'Giá căn hộ tháng {int(period[5:])}/{period[:4]} Đơn giá phổ biến {capture["rawPrice"]} triệu/m² {capture.get("changePct", "")}%'
                text += " so với " + ("quý" if capture.get("changePeriod") == "quarter" else "tháng") + " trước"
                row = parse_project_text(config, text, checked_at)
                row["retrieval"] = "public_page_verification"
            else:
                row = parse_project_html(config, fetch_html(config["url"]), checked_at)
            rows.append(row)
        except Exception as error:
            rows.append(retain_on_error(config, old_rows.get(config["id"]), checked_at, error))
            print(f'[source-error] {config["id"]}: {error}', flush=True)
        if captures is None:
            time.sleep(0.3)
    snapshot = build_snapshot(configs, rows, history, checked_at)
    atomic_json(HISTORY_OUT, history)
    atomic_json(OUT, snapshot)
    print(json.dumps({
        "status": snapshot["meta"]["status"], "checked": snapshot["meta"]["successfulProjectCount"],
        "expected": len(configs), "lastAttemptAt": checked_at,
    }, ensure_ascii=False))

if __name__ == "__main__":
    main()
