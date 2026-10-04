import copy
import json
import math
import tempfile
import unittest
from pathlib import Path
from scripts import update_live_market as m

CONFIG = {"id": "smart", "name": "Smart City", "url": "https://onehousing.vn/project", "segment": "SECONDARY"}
NOW = "2026-10-04T11:36:36+07:00"

def price(raw="92.08", period="10/2026", change="-2.28"):
    return m.parse_project_text(CONFIG, f"Biến động giá tháng {period} Giá phổ biến 4.71 tỷ Đơn giá phổ biến Mức giá/mét vuông {raw} triệu/m² {change}% Khoảng giá 77.71 - 118.07 triệu so với tháng trước", NOW)

class CollectorTests(unittest.TestCase):
    def test_decimal_dots_commas_and_signs(self):
        for raw, expected in [("92.08", 92.08), ("110.75", 110.75), ("104,56", 104.56), ("89", 89)]:
            with self.subTest(raw=raw):
                self.assertEqual(price(raw)["price"], expected)
        self.assertEqual(price()["changePct"], -2.28)
        self.assertEqual(price(change="0")["changePct"], 0)
        self.assertEqual(price(change="−3,27")["changePct"], -3.27)
        for raw in ["1.234.567", "1,234.56", "nan", "inf", ""]:
            with self.assertRaises(ValueError): m.decimal_number(raw)

    def test_source_period_not_check_date(self):
        row = price(period="8/2026")
        self.assertEqual(row["sourcePeriod"], "2026-08")
        self.assertEqual(row["checkedAt"], NOW)
        with self.assertRaises(ValueError): price(period="11/2026")
        with self.assertRaises(ValueError): m.parse_project_text(CONFIG, "Đơn giá phổ biến 92.08 triệu/m²", NOW)
        with self.assertRaises(ValueError): m.parse_project_text(CONFIG, "Tin tức tháng 8/2026 " + "x" * 700 + " Đơn giá phổ biến 92.08 triệu/m²", NOW)

    def test_unreasonable_price_and_bad_percent_rejected(self):
        for raw in ["9208", "1", "11075", "-92"]:
            with self.assertRaises(ValueError): price(raw)
        with self.assertRaises(ValueError): price(change="1000")

    def test_html_ignores_hidden_script_statistics(self):
        html = "<script>tháng 10/2026 Đơn giá phổ biến 999 triệu/m²</script><h2>tháng 9/2026</h2><div>Đơn giá phổ biến</div><b>93.06</b> triệu/m² <span>-2.28%</span> so với tháng trước"
        row = m.parse_project_html(CONFIG, html, NOW)
        self.assertEqual(row["price"], 93.06)
        self.assertEqual(row["sourcePeriod"], "2026-09")

    def test_failure_keeps_actual_last_success(self):
        previous = price(period="8/2026")
        previous["checkedAt"] = "2026-09-01T01:00:00+07:00"
        retained = m.retain_on_error(CONFIG, previous, NOW, ValueError("missing price"))
        self.assertEqual(retained["price"], previous["price"])
        self.assertEqual(retained["checkedAt"], previous["checkedAt"])
        self.assertEqual(retained["sourcePeriod"], "2026-08")
        self.assertEqual(retained["lastAttemptAt"], NOW)
        self.assertEqual(retained["status"], "STALE_FETCH_ERROR")
        legacy = {**previous, "methodVersion": "V1"}
        self.assertIsNone(m.retain_on_error(CONFIG, legacy, NOW, Exception("fail"))["price"])
        self.assertIsNone(m.retain_on_error(CONFIG, {}, NOW, Exception("fail"))["price"])

    def test_no_daily_or_weekly_invented_history(self):
        history = m.clean_history({})
        first = price(period="9/2026")
        m.upsert_project_history(history, first)
        m.upsert_project_history(history, {**first, "price": 93.06, "checkedAt": NOW})
        self.assertEqual(len(history["projects"]["smart"]), 1)
        self.assertEqual(history["projects"]["smart"][0]["price"], 93.06)
        m.upsert_project_history(history, price())
        self.assertEqual(len(history["projects"]["smart"]), 2)
        stale = m.retain_on_error(CONFIG, price(), NOW, Exception("fail"))
        m.upsert_project_history(history, stale)
        self.assertEqual(len(history["projects"]["smart"]), 2)
        self.assertEqual(history["meta"]["methodVersion"], m.METHOD_VERSION)

    def test_fixed_basket_requires_every_member_and_same_period(self):
        second = {**CONFIG, "id": "masteri"}
        configs = [CONFIG, second]
        rows = [price(), {**price("110.75"), **second}]
        history = m.clean_history({})
        snapshot = m.build_snapshot(configs, rows, history, NOW)
        basket = snapshot["symbols"]["HN-APT-SEC"]
        self.assertAlmostEqual(basket["price"], 101.415)
        self.assertEqual(basket["history"][0]["members"], ["smart", "masteri"])
        mixed = copy.deepcopy(rows); mixed[1]["sourcePeriod"] = "2026-09"
        result = m.summarize(configs, mixed, m.clean_history({}))
        self.assertFalse(result["coherent"])
        self.assertIsNone(result["price"])
        self.assertEqual(result["history"], [])
        missing = m.retain_on_error(second, {}, NOW, Exception("fail"))
        result = m.build_snapshot(configs, [rows[0], missing], m.clean_history({}), NOW)
        self.assertEqual(result["meta"]["status"], "PARTIAL")
        self.assertIsNone(result["symbols"]["HN-APT-SEC"]["price"])

    def test_all_failure_not_success_and_no_new_history(self):
        row = m.retain_on_error(CONFIG, price(period="9/2026"), NOW, Exception("fail"))
        result = m.build_snapshot([CONFIG], [row], m.clean_history({}), NOW)
        self.assertEqual(result["meta"]["status"], "SOURCE_ERROR")
        self.assertEqual(result["symbols"]["HN-APT-SEC"]["history"], [])
        self.assertEqual(result["meta"]["successfulProjectCount"], 0)

    def test_legacy_invalid_boolean_nan_not_used(self):
        for invalid in [True, math.nan, math.inf, None, 9208]:
            row = {**price(), "price": invalid}
            self.assertFalse(m.valid_previous(row))
            self.assertEqual(m.basket_history([CONFIG], {"projects": {"smart": [row]}}), [])
        old = m.clean_history({"symbols": {"HN-APT-SEC": [56.52]}})
        self.assertTrue(old["migration"]["discardedLegacyNowcast"])
        self.assertEqual(old["projects"], {})

    def test_corrupt_history_not_overwritten(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "history.json"
            path.write_text("{bad", encoding="utf-8")
            with self.assertRaises(json.JSONDecodeError): m.load_json(path, {})
            self.assertEqual(path.read_text(), "{bad")

if __name__ == "__main__": unittest.main()
