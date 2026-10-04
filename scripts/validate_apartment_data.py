"""Validate the deployable snapshot, its provenance, and fixed-member baskets."""
import json
import math
from pathlib import Path
import update_live_market as m

def validate():
    data = Path(__file__).resolve().parent.parent / "apartment-lab" / "data"
    read = lambda name: json.loads((data / name).read_text(encoding="utf-8"))
    config, live, history, reports = (read(name) for name in ["project-config.json", "live-market.json", "live-history.json", "market-indices.json"])
    assert live["meta"]["methodVersion"] == history["meta"]["methodVersion"] == m.METHOD_VERSION
    assert live["meta"]["lastAttemptAt"] == history["meta"]["lastAttemptAt"]
    assert set(x["id"] for x in config) == set(x["id"] for x in live["projects"])
    assert len(live["projects"]) == len(config)
    for project in live["projects"]:
        assert project["url"].startswith("https://onehousing.vn/")
        assert project["status"] in ("VERIFIED", "STALE_FETCH_ERROR", "UNAVAILABLE")
        if project["price"] is not None:
            assert m.valid_previous(project), project["id"]
            assert project["sourcePeriod"] <= live["meta"]["lastAttemptAt"][:7]
            assert project["checkedAt"] and project["checkedAt"] <= project["lastAttemptAt"]
        if project["status"] == "VERIFIED":
            assert project["checkedAt"] == live["meta"]["lastAttemptAt"]
            assert math.isclose(project["price"], m.decimal_number(project["rawPrice"]))
    for ident, records in history["projects"].items():
        assert len(records) == len({x["sourcePeriod"] for x in records}), ident
        assert all(m.valid_previous(x) for x in records), ident
    for symbol, group in [("HN-APT-ALL", config), ("HN-APT-SEC", [c for c in config if c["segment"] == "SECONDARY"]), ("HN-APT-PRI", [c for c in config if c["segment"] == "PRIMARY"])]:
        assert live["symbols"][symbol]["history"] == m.basket_history(group, history), symbol
        if not live["symbols"][symbol]["coherent"]: assert live["symbols"][symbol]["price"] is None
    assert reports["meta"]["schemaVersion"] == 2
    for symbol in reports["symbols"]:
        for source in symbol["referenceSets"]:
            assert source["frequency"] in ("M1", "Q1")
            assert len(source["points"]) == len({p["period"] for p in source["points"]})
            assert all(isinstance(p["value"], (float, int)) and math.isfinite(p["value"]) and p["value"] > 0 and p.get("quality") for p in source["points"])
    print(f'Validated {len(config)} projects, source-period history and 3 separate report groups.')

if __name__ == "__main__": validate()
