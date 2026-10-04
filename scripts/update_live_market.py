#!/usr/bin/env python3
import json, math, os, re, statistics, time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
import requests
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "apartment-lab", "data", "live-market.json")
HISTORY_OUT = os.path.join(ROOT, "apartment-lab", "data", "live-history.json")
PROJECTS_FILE = os.path.join(ROOT, "apartment-lab", "data", "projects.json")
SEC_BENCHMARK_Q2 = 60.0
SEC_PROP_3M_FACTOR = 0.942  # PropLab: Aug asking P50 typical whole-sample change -5.8% vs May; used only as a low-confidence bridge.
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
  ("ocean","Vinhomes Ocean Park Gia Lam","https://batdongsan.com.vn/ban-can-ho-chung-cu-vinhomes-ocean-park-gia-lam"),
  ("smart","Vinhomes Smart City","https://batdongsan.com.vn/ban-can-ho-chung-cu-vinhomes-smart-city"),
  ("masteri","Masteri West Heights","https://batdongsan.com.vn/ban-can-ho-chung-cu-masteri-west-heights"),
  ("times","Times City","https://batdongsan.com.vn/ban-can-ho-chung-cu-times-city"),
  ("royal","Royal City","https://batdongsan.com.vn/ban-can-ho-chung-cu-royal-city"),
  ("skylake","Vinhomes Skylake","https://batdongsan.com.vn/ban-can-ho-chung-cu-vinhomes-skylake-pham-hung"),
  ("metropolis","Vinhomes Metropolis","https://batdongsan.com.vn/ban-can-ho-chung-cu-vinhomes-metropolis-lieu-giai"),
  ("goldmark","Goldmark City","https://batdongsan.com.vn/ban-can-ho-chung-cu-goldmark-city"),
  ("sunshine","Sunshine City","https://batdongsan.com.vn/ban-can-ho-chung-cu-sunshine-city"),
  ("mipec","Mipec Rubik 360","https://batdongsan.com.vn/ban-can-ho-chung-cu-mipec-rubik-360"),
  ("gardenia","Vinhomes Gardenia","https://batdongsan.com.vn/ban-can-ho-chung-cu-vinhomes-gardenia"),
  ("hanoihomeland","Ha Noi Homeland","https://batdongsan.com.vn/ban-can-ho-chung-cu-ha-noi-homeland"),
]

ONEHOUSING_SECONDARY = [
  ("ocean","Vinhomes Ocean Park","https://onehousing.vn/phan-tich/du-an/can-ho-biet-thu-lien-ke-du-an-Vinhomes-Ocean-Park.877"),
  ("smart","Vinhomes Smart City","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Vinhomes-Smart-City.102"),
  ("masteri","Masteri West Heights","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Masteri-West-Heights.10"),
  ("times","Vinhomes Times City","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Vinhomes-Times-City.136"),
  ("royal","Vinhomes Royal City","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Vinhomes-Royal-City.634"),
  ("skylake","Vinhomes Skylake","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Vinhomes-Skylake.939"),
  ("metropolis","Vinhomes Metropolis","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Vinhomes-Metropolis.1061"),
  ("goldmark","Goldmark City","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Goldmark-City.68"),
  ("sunshine","Sunshine City","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Sunshine-City.750"),
  ("mipec","Mipec Rubik 360","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Mipec-Rubik-360.610"),
  ("gardenia","Vinhomes Gardenia","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Vinhomes-Gardenia.867"),
  ("zei","The Zei","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-The-Zei.1046"),
  ("hanoihomeland","Ha Noi Homeland","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Ha-Noi-Homeland.354"),
]

ONEHOUSING_PRIMARY = [
  ("mga","Masteri Grand Avenue","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-Masteri-Grand-Avenue.1171"),
  ("senique","The Senique Hanoi","https://onehousing.vn/phan-tich/du-an/can-ho-chung-cu-du-an-The-Senique-Hanoi.1181"),
]

ALL_BASKET_BASE = 80.5
PRI_BASKET_BASE = 95.0

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
    for item in projects:
        if len(item)==3:
            pid,name,url=item
        else:
            pid=None; name,url=item
        try:
            x=project_snapshot(name,url)
            if pid is not None:x["id"]=pid
            rows.append(x)
            if x["listingMedian"] is not None:
                w=max(1, min(x["listingCount"] or 1, 500))
                weighted.extend([x["listingMedian"]]*w)
        except Exception as e:
            print(f"[project-fetch-error] {name}: {e}")
            row={"name":name,"url":url,"error":str(e)[:180]}
            if pid is not None:row["id"]=pid
            rows.append(row)
        time.sleep(0.6)
    stats=robust_stats(weighted)
    return rows,stats

def load_project_baselines():
    try:
        with open(PROJECTS_FILE,"r",encoding="utf-8") as f:data=json.load(f)
    except Exception:
        return {}
    out={}
    for p in data.get("projects",[]):
        value=p.get("reference")
        if value is None and p.get("low") is not None and p.get("high") is not None:
            value=(float(p["low"])+float(p["high"]))/2
        if value is not None:
            out[p.get("id")]={"price":float(value),"name":p.get("name"),"listingCount":p.get("listingCount")}
    return out

def fixed_basket_ratio(rows, baselines):
    ratios=[]; detail=[]
    for r in rows:
        pid=r.get("id"); cur=r.get("listingMedian"); base=(baselines.get(pid) or {}).get("price")
        if pid and cur is not None and base and 0.6 <= float(cur)/float(base) <= 1.4:
            ratio=float(cur)/float(base)
            ratios.append(ratio)
            detail.append({"id":pid,"name":r.get("name"),"baseline":round(base,2),"current":round(float(cur),2),"ratio":round(ratio,5)})
    if len(ratios)<3:
        return None,detail
    return statistics.median(ratios),detail

def load_history():
    try:
        with open(HISTORY_OUT,"r",encoding="utf-8") as f:return json.load(f)
    except Exception:
        return {"meta":{"version":1},"symbols":{"HN-APT-ALL":[],"HN-APT-SEC":[],"HN-APT-PRI":[]}}

def upsert_daily(history,symbol,row):
    arr=history.setdefault("symbols",{}).setdefault(symbol,[])
    date=row.get("date")
    arr[:]=[x for x in arr if x.get("date")!=date]
    arr.append(row)
    arr.sort(key=lambda x:x.get("date",""))
    if len(arr)>740:del arr[:-740]

def onehousing_snapshot(pid, name, url):
    txt=text_of(fetch(url))
    m=re.search(r"Đơn giá phổ biến.{0,260}?(\d{1,4}(?:[\.,]\d+)?)\s*triệu\/m²\s*([+-]?\d+(?:[\.,]\d+)?)%",txt,re.I)
    if not m:
        m=re.search(r"Đơn giá phổ biến.{0,260}?(\d{1,4}(?:[\.,]\d+)?)\s*triệu\/m²",txt,re.I)
    if not m:
        raise ValueError("OneHousing unit-price block not found")
    price=num(m.group(1))
    change_pct=num(m.group(2)) if m.lastindex and m.lastindex>=2 and m.group(2) is not None else None
    pm=re.search(r"tháng\s*(\d{1,2})\/(\d{4})",txt,re.I)
    period=(pm.group(2)+"-"+pm.group(1).zfill(2)) if pm else None
    return {"id":pid,"name":name,"url":url,"price":round(price,2),"changePct":change_pct,"period":period}

def fetch_onehousing_basket(items):
    rows=[]
    for pid,name,url in items:
        try:
            rows.append(onehousing_snapshot(pid,name,url))
        except Exception as e:
            print(f"[onehousing-fetch-error] {name}: {e}")
        time.sleep(0.35)
    return rows

def basket_ratio(rows, baseline):
    pairs=[]
    for r in rows:
        base=(baseline or {}).get(r.get("id"))
        cur=r.get("price")
        if base and cur and 0.65 <= float(cur)/float(base) <= 1.35:
            pairs.append(float(cur)/float(base))
    return statistics.median(pairs) if len(pairs)>=2 else None

def ensure_baseline(rows, previous):
    baseline=dict(previous or {})
    if not baseline:
        baseline={r["id"]:float(r["price"]) for r in rows if r.get("id") and r.get("price")}
    return baseline

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
        except Exception as e:
            print(f"[all-market-fetch-error] {url}: {e}")
        time.sleep(0.5)
    return robust_stats(values),listing_count,verified_count,last_update,ok

def load_previous():
    try:
        with open(OUT,"r",encoding="utf-8") as f:return json.load(f)
    except Exception:return {"symbols":{}}

def main():
    prev=load_previous()
    history=load_history()
    baselines=load_project_baselines()
    now_dt=datetime.now(ZoneInfo("Asia/Ho_Chi_Minh"))
    now=now_dt.isoformat(timespec="seconds")
    today=now_dt.date().isoformat()
    # Batdongsan blocks GitHub-hosted runners (HTTP 403), so automated nowcast uses fixed OneHousing baskets.
    sec_rows=fetch_onehousing_basket(ONEHOUSING_SECONDARY)
    pri_rows=fetch_onehousing_basket(ONEHOUSING_PRIMARY)
    all_rows=sec_rows+pri_rows
    old_symbols=(prev.get("symbols") or {})
    sec_baseline=ensure_baseline(sec_rows,(old_symbols.get("HN-APT-SEC") or {}).get("sourceBasketBaseline"))
    pri_baseline=ensure_baseline(pri_rows,(old_symbols.get("HN-APT-PRI") or {}).get("sourceBasketBaseline"))
    all_baseline=ensure_baseline(all_rows,(old_symbols.get("HN-APT-ALL") or {}).get("sourceBasketBaseline"))
    sec_ratio=basket_ratio(sec_rows,sec_baseline) or 1.0
    pri_ratio=basket_ratio(pri_rows,pri_baseline) or 1.0
    all_ratio=basket_ratio(all_rows,all_baseline) or 1.0
    sec_bridge_aug=round(SEC_BENCHMARK_Q2*SEC_PROP_3M_FACTOR,2)
    sec_chart_price=round(sec_bridge_aug*sec_ratio,2)
    pri_chart_price=round(PRI_BASKET_BASE*pri_ratio,2)
    all_chart_price=round(ALL_BASKET_BASE*all_ratio,2)
    out={
      "meta":{
        "updatedAt":now,
        "cadence":"hourly",
        "mode":"LIVE_LISTING_NOWCAST",
        "method":"Public asking-listing proxy; not observed transaction price.",
        "source":"OneHousing fixed baskets",
      },
      "symbols":{}
    }
    def keep_or(symbol,obj):
        old=(prev.get("symbols") or {}).get(symbol)
        if obj.get("price") is None and old:return old
        return obj
    out["symbols"]["HN-APT-ALL"]=keep_or("HN-APT-ALL",{
      "price": all_chart_price,
      "chartPrice": all_chart_price,
      "sourceBasketBaseline": all_baseline,
      "fixedBasketRatio":round(all_ratio,5),
      "projects":all_rows,
      "parsedProjectCount":len(all_rows),
      "listingCount":(old_symbols.get("HN-APT-ALL") or {}).get("listingCount"),
      "verifiedCount":(old_symbols.get("HN-APT-ALL") or {}).get("verifiedCount"),
      "historyType":"LIVE_ALL_FIXED_BASKET_NOWCAST",
      "anchorCompatible": len(all_rows)>=4,
      "trendDirection":"LIVE",
      "source":"OneHousing fixed basket",
      "note":"Calibrated to 80.5 million VND/m² at basket start; subsequent moves use the median relative change of a fixed OneHousing project basket."
    })
    out["symbols"]["HN-APT-PRI"]=keep_or("HN-APT-PRI",{
      "price": pri_chart_price,
      "chartPrice": pri_chart_price,
      "sourceBasketBaseline": pri_baseline,
      "fixedBasketRatio":round(pri_ratio,5),
      "projects":pri_rows,
      "parsedProjectCount":len(pri_rows),
      "historyType":"LIVE_PRIMARY_FIXED_BASKET_NOWCAST",
      "anchorCompatible": len(pri_rows)>=2,
      "trendDirection":"LIVE",
      "confidence":"LOW",
      "note":"Low-confidence primary nowcast: CBRE Q2 benchmark level calibrated to a small fixed OneHousing primary basket; expands as more projects become parseable."
    })
    out["symbols"]["HN-APT-SEC"]=keep_or("HN-APT-SEC",{
      "price": sec_chart_price,
      "chartPrice": sec_chart_price,
      "sourceBasketBaseline": sec_baseline,
      "fixedBasketRatio":round(sec_ratio,5),
      "projects":sec_rows,
      "parsedProjectCount":len(sec_rows),
      "historyType":"LIVE_SECONDARY_FIXED_BASKET_NOWCAST",
      "anchorCompatible": len(sec_rows)>=4,
      "trendDirection":"DOWN" if sec_chart_price < SEC_BENCHMARK_Q2 else "LIVE",
      "source":"OneHousing fixed basket",
      "nowcastAnchors":[
        {"date":"2026-06-30","price":SEC_BENCHMARK_Q2,"historyType":"PUBLISHED_BENCHMARK_CBRE_Q2"},
        {"date":"2026-08-06","price":sec_bridge_aug,"historyType":"MODELED_BRIDGE_PROPLAB_3M","confidence":"LOW"},
        {"date":today,"price":sec_chart_price,"historyType":"FIXED_BASKET_NOWCAST","confidence":"MEDIUM" if len(sec_rows)>=6 else "LOW"}
      ],
      "note":"CBRE Q2 benchmark is bridged by the observed PropLab decline, then future movement is chained from a fixed OneHousing secondary project basket. No absolute basket price is mixed into the benchmark."
    })

    # Persist one observation per day so weekly candles gradually become observed nowcast history.
    all_live=out["symbols"].get("HN-APT-ALL",{})
    if all_live.get("price") is not None:
        upsert_daily(history,"HN-APT-ALL",{"date":today,"price":all_live.get("chartPrice",all_live.get("price")),"projectCount":all_live.get("parsedProjectCount"),"fixedBasketRatio":all_live.get("fixedBasketRatio"),"historyType":"LIVE_ALL_FIXED_BASKET_NOWCAST","anchorCompatible":all_live.get("anchorCompatible",False)})
    sec_live=out["symbols"].get("HN-APT-SEC",{})
    if sec_live.get("chartPrice") is not None:
        upsert_daily(history,"HN-APT-SEC",{"date":today,"price":sec_live.get("chartPrice"),"projectCount":sec_live.get("parsedProjectCount"),"fixedBasketRatio":sec_live.get("fixedBasketRatio"),"historyType":"FIXED_BASKET_NOWCAST","anchorCompatible":sec_live.get("anchorCompatible",False)})
    pri_live=out["symbols"].get("HN-APT-PRI",{})
    if pri_live.get("price") is not None:
        upsert_daily(history,"HN-APT-PRI",{"date":today,"price":pri_live.get("chartPrice",pri_live.get("price")),"projectCount":pri_live.get("parsedProjectCount"),"fixedBasketRatio":pri_live.get("fixedBasketRatio"),"historyType":"LIVE_PRIMARY_FIXED_BASKET_NOWCAST","anchorCompatible":pri_live.get("anchorCompatible",False)})
    history["meta"]={"version":1,"updatedAt":now,"cadence":"daily-upsert from hourly fetch","note":"Observed listing-nowcast history; not transaction-price history."}

    os.makedirs(os.path.dirname(OUT),exist_ok=True)
    with open(HISTORY_OUT,"w",encoding="utf-8") as f:json.dump(history,f,ensure_ascii=False,indent=2)
    os.makedirs(os.path.dirname(OUT),exist_ok=True)
    with open(OUT,"w",encoding="utf-8") as f:json.dump(out,f,ensure_ascii=False,indent=2)
    print(json.dumps({
      "updatedAt":now,
      "allPrice":out["symbols"]["HN-APT-ALL"].get("chartPrice"),
      "allProjects":out["symbols"]["HN-APT-ALL"].get("parsedProjectCount"),
      "priPrice":out["symbols"]["HN-APT-PRI"].get("chartPrice"),
      "priProjects":out["symbols"]["HN-APT-PRI"].get("parsedProjectCount"),
      "secPrice":out["symbols"]["HN-APT-SEC"].get("chartPrice"),
      "secProjects":out["symbols"]["HN-APT-SEC"].get("parsedProjectCount"),
      "secRatio":out["symbols"]["HN-APT-SEC"].get("fixedBasketRatio")
    },ensure_ascii=False))

if __name__=="__main__":
    main()
