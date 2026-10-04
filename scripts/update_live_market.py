#!/usr/bin/env python3
import json, math, os, re, statistics, time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "apartment-lab", "data", "live-market.json")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154 Safari/537.36"
S = requests.Session()
S.headers.update({"User-Agent": UA, "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.7"})

ALL_BASE = "https://batdongsan.com.vn/ban-can-ho-chung-cu-ha-noi"

PRIMARY_PROJECTS = [
  ("Masteri Grand Avenue","https://batdongsan.com.vn/ban-can-ho-chung-cu-masteri-grand-avenue"),
  ("The Senique Hanoi","https://batdongsan.com.vn/ban-can-ho-chung-cu-chung-cu-the-senique-hanoi"),
  ("Lumi Hanoi","https://batdongsan.com.vn/ban-can-ho-chung-cu-lumi-hanoi"),
  ("Lumi Elite","https://batdongsan.com.vn/ban-can-ho-chung-cu-lumi-elite"),
  ("The Matrix One Premium","https://batdongsan.com.vn/ban-can-ho-chung-cu-the-matrix-one-premium"),
  ("BID Residence","https://batdongsan.com.vn/ban-can-ho-chung-cu-bid-residence"),
]

SECONDARY_PROJECTS = [
  ("Vinhomes Ocean Park Gia Lam","https://batdongsan.com.vn/ban-can-ho-chung-cu-vinhomes-ocean-park-gia-lam"),
  ("Vinhomes Smart City","https://batdongsan.com.vn/ban-can-ho-chung-cu-vinhomes-smart-city"),
  ("Masteri West Heights","https://batdongsan.com.vn/ban-can-ho-chung-cu-masteri-west-heights"),
  ("Times City","https://batdongsan.com.vn/ban-can-ho-chung-cu-times-city"),
  ("Royal City","https://batdongsan.com.vn/ban-can-ho-chung-cu-royal-city"),
  ("Vinhomes Skylake","https://batdongsan.com.vn/ban-can-ho-chung-cu-vinhomes-skylake-pham-hung"),
  ("Vinhomes Metropolis","https://batdongsan.com.vn/ban-can-ho-chung-cu-vinhomes-metropolis-lieu-giai"),
  ("Goldmark City","https://batdongsan.com.vn/ban-can-ho-chung-cu-goldmark-city"),
  ("Sunshine City","https://batdongsan.com.vn/ban-can-ho-chung-cu-sunshine-city"),
  ("Mipec Rubik 360","https://batdongsan.com.vn/ban-can-ho-chung-cu-mipec-rubik-360"),
  ("Vinhomes Gardenia","https://batdongsan.com.vn/ban-can-ho-chung-cu-vinhomes-gardenia"),
  ("Ha Noi Homeland","https://batdongsan.com.vn/ban-can-ho-chung-cu-ha-noi-homeland"),
  ("Xuan Mai Complex","https://batdongsan.com.vn/ban-can-ho-chung-cu-xuan-mai-complex"),
]

def num(s):
    return float(s.replace(".", "").replace(",", "."))

def fetch(url):
    r = S.get(url, timeout=25)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or "utf-8"
    return r.text

def text_of(html):
    return BeautifulSoup(html, "html.parser").get_text(" ", strip=True)

def count_re(pattern, text):
    m = re.search(pattern, text, re.I)
    return int(m.group(1).replace(".", "").replace(",", "")) if m else None

def listing_values(text):
    # Limit to the listing section and ignore FAQ/history summaries as much as possible.
    for marker in ("Lịch sử giá", "Các câu hỏi thường gặp", "Tìm kiếm theo từ khóa"):
        if marker in text:
            text = text.split(marker, 1)[0]
    vals = []
    for m in re.finditer(r"(\d{1,4}(?:[\.,]\d{1,2})?)\s*(?:tr|triệu)\/m²", text, re.I):
        try:
            v = num(m.group(1))
            if 15 <= v <= 500:
                vals.append(v)
        except Exception:
            pass
    # Also derive price/m2 from "x tỷ · y m²" when explicit unit-price is absent.
    for m in re.finditer(r"(\d{1,3}(?:[\.,]\d{1,3})?)\s*tỷ\s*·\s*(\d{1,4}(?:[\.,]\d{1,2})?)\s*m²", text, re.I):
        try:
            total_b = num(m.group(1)); area = num(m.group(2))
            v = total_b * 1000 / area
            if 15 <= v <= 500:
                vals.append(v)
        except Exception:
            pass
    return vals

def robust_stats(values):
    xs = sorted(v for v in values if math.isfinite(v))
    if not xs:
        return None
    if len(xs) >= 20:
        lo = int(len(xs)*0.05); hi = max(lo+1, int(len(xs)*0.95))
        xs2 = xs[lo:hi]
    else:
        xs2 = xs
    return {
      "median": round(statistics.median(xs2), 2),
      "mean": round(statistics.fmean(xs2), 2),
      "p25": round(xs2[max(0, int(len(xs2)*0.25)-1)], 2),
      "p75": round(xs2[min(len(xs2)-1, int(len(xs2)*0.75))], 2),
      "sampleCount": len(xs2),
    }

def project_snapshot(name, url):
    html = fetch(url); txt = text_of(html)
    count = count_re(r"Hiện có\s*([\d\.,]+)\s*bất động sản", txt)
    # Prefer project summary range. Several page templates use either "Giá bán ... |" or status-line ranges.
    patterns = [
      r"Giá bán căn hộ chung cư[^|]{0,120}\|\s*(\d{1,4}(?:[\.,]\d+)?)\s*-\s*(\d{1,4}(?:[\.,]\d+)?)\s*(?:tr|triệu)\/m²",
      r"(?:Đang mở bán|Đã bàn giao|Dự kiến bàn giao[^·]{0,80})\s*·\s*(\d{1,4}(?:[\.,]\d+)?)\s*-\s*(\d{1,4}(?:[\.,]\d+)?)\s*(?:tr|triệu)\/m²",
    ]
    low = high = None
    for p in patterns:
        m = re.search(p, txt, re.I)
        if m:
            low, high = num(m.group(1)), num(m.group(2)); break
    vals = listing_values(txt)
    stats = robust_stats(vals)
    price = stats["median"] if stats and stats["sampleCount"] >= 3 else ((low+high)/2 if low and high else None)
    return {"name":name,"url":url,"listingCount":count,"rangeLow":low,"rangeHigh":high,
            "listingMedian":price,"parsedSampleCount":stats["sampleCount"] if stats else 0}

def weighted_project_proxy(projects):
    rows=[]; weighted=[]
    for name,url in projects:
        try:
            x=project_snapshot(name,url); rows.append(x)
            if x["listingMedian"] is not None:
                w=max(1, min(x["listingCount"] or 1, 500))
                weighted.extend([x["listingMedian"]]*w)
        except Exception as e:
            rows.append({"name":name,"url":url,"error":str(e)[:180]})
        time.sleep(0.6)
    stats=robust_stats(weighted)
    return rows,stats

def all_market():
    values=[]; listing_count=verified_count=None; last_update=None
    pages=[ALL_BASE] + [ALL_BASE + f"/p{i}" for i in range(2,9)]
    ok=0
    for idx,url in enumerate(pages):
        try:
            txt=text_of(fetch(url))
            if idx==0:
                listing_count=count_re(r"Hiện có\s*([\d\.,]+)\s*bất động sản",txt)
                verified_count=count_re(r"Xem\s*([\d\.,]+)\s*Tin xác thực",txt)
                m=re.search(r"Cập nhật tin đăng gần đây nhất\s*\|?\s*(\d{2}-\d{2}-\d{4},\s*\d{2}:\d{2})",txt,re.I)
                if m:last_update=m.group(1)
            values.extend(listing_values(txt)); ok+=1
        except Exception:
            pass
        time.sleep(0.5)
    return robust_stats(values),listing_count,verified_count,last_update,ok

def load_previous():
    try:
        with open(OUT,"r",encoding="utf-8") as f:return json.load(f)
    except Exception:return {"symbols":{}}

def main():
    prev=load_previous()
    now=datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).isoformat(timespec="seconds")
    all_stats,all_count,verified,last_update,pages_ok=all_market()
    pri_rows,pri_stats=weighted_project_proxy(PRIMARY_PROJECTS)
    sec_rows,sec_stats=weighted_project_proxy(SECONDARY_PROJECTS)
    out={
      "meta":{
        "updatedAt":now,
        "cadence":"hourly",
        "mode":"LIVE_LISTING_NOWCAST",
        "method":"Public asking-listing proxy; not observed transaction price.",
        "source":"Batdongsan.com.vn",
      },
      "symbols":{}
    }
    def keep_or(symbol,obj):
        old=(prev.get("symbols") or {}).get(symbol)
        if obj.get("price") is None and old:return old
        return obj
    out["symbols"]["HN-APT-ALL"]=keep_or("HN-APT-ALL",{
      "price": all_stats["median"] if all_stats else None,
      "mean": all_stats["mean"] if all_stats else None,
      "p25": all_stats["p25"] if all_stats else None,
      "p75": all_stats["p75"] if all_stats else None,
      "parsedSampleCount": all_stats["sampleCount"] if all_stats else 0,
      "listingCount": all_count,
      "verifiedCount": verified,
      "sourceLastListingUpdate": last_update,
      "pagesParsed": pages_ok,
      "sourceUrl": ALL_BASE,
      "historyType":"LIVE_LISTING_NOWCAST",
      "anchorCompatible": True,
      "trendDirection":"SOFT"
    })
    out["symbols"]["HN-APT-PRI"]=keep_or("HN-APT-PRI",{
      "price": pri_stats["median"] if pri_stats else None,
      "p25": pri_stats["p25"] if pri_stats else None,
      "p75": pri_stats["p75"] if pri_stats else None,
      "parsedSampleCount": sum((r.get("parsedSampleCount") or 0) for r in pri_rows),
      "listingCount": sum((r.get("listingCount") or 0) for r in pri_rows),
      "projects":pri_rows,
      "historyType":"LIVE_PRIMARY_PROJECT_BASKET_PROXY",
      "anchorCompatible": False,
      "trendDirection":"HIGH_STABLE",
      "note":"Current asking-price proxy from a maintained basket of projects still selling / recently launched. Not directly comparable to CBRE primary benchmark."
    })
    out["symbols"]["HN-APT-SEC"]=keep_or("HN-APT-SEC",{
      "price": sec_stats["median"] if sec_stats else None,
      "p25": sec_stats["p25"] if sec_stats else None,
      "p75": sec_stats["p75"] if sec_stats else None,
      "parsedSampleCount": sum((r.get("parsedSampleCount") or 0) for r in sec_rows),
      "listingCount": sum((r.get("listingCount") or 0) for r in sec_rows),
      "projects":sec_rows,
      "historyType":"LIVE_SECONDARY_PROJECT_BASKET_PROXY",
      "anchorCompatible": False,
      "trendDirection":"DOWN",
      "note":"Current asking-price proxy from a maintained basket of completed/resale projects. Absolute level is not directly comparable to CBRE secondary benchmark."
    })
    os.makedirs(os.path.dirname(OUT),exist_ok=True)
    with open(OUT,"w",encoding="utf-8") as f:json.dump(out,f,ensure_ascii=False,indent=2)
    print(json.dumps({"updatedAt":now,"all":out["symbols"]["HN-APT-ALL"],"priPrice":out["symbols"]["HN-APT-PRI"].get("price"),"secPrice":out["symbols"]["HN-APT-SEC"].get("price")},ensure_ascii=False))

if __name__=="__main__":
    main()
