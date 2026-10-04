# gianha · Giá chung cư Hà Nội

Static dashboard published by `.github/workflows/apartment-pages.yml` to the existing GitHub Pages site. The cryptocurrency application elsewhere in this repository is independent.

## Data contract

- `data/project-config.json`: the fixed project membership and public source URLs.
- `data/live-market.json`: latest public **popular unit price** per project, million VND/m²; it is not an individual apartment transaction price.
- `data/live-history.json`: one observation per project **source month**. Rechecking the same month replaces that month's price; it never creates artificial daily or weekly observations. The old calibrated V1 history is excluded.
- The source heading supplies `sourcePeriod`; `checkedAt` is the last successful retrieval and `lastAttemptAt` is the latest attempt. A failed fetch retains a previously validated price and its original period/check time with `STALE_FETCH_ERROR`. An unavailable project has a null price.
- A basket requires every configured member and a common source month. It uses an equal-weight median of project popular unit prices. It is not a citywide market average. Project-stage groups are a classification proxy, not verified primary/secondary transaction classifications. Historical baskets are reconstructed using the same current fixed members.
- Market reports are separate `referenceSets` in `data/market-indices.json`. Different providers, coverage, metrics and project baskets are never stitched together. Forecasts, calculated points and estimates are explicitly labelled. One Mount's sample includes Văn Giang, Hưng Yên.

## Charts and indicators

`market-core.js` contains pure series and indicator calculations. The page uses the pinned Lightweight Charts 5.2.1 line-series library, with a point for each observed price period. It does not have source OHLC data, so it does not render invented candles. Missing periods remain whitespace. Quarterly and annual views use the last source observation of the period, not its mean. Weekly views are disabled until genuine weekly observations exist.

SMA/EMA 20/50/100, Bollinger, RSI and MACD work in **source periods**, restart after missing/ineligible periods and wait for sufficient observations. Forecast, digitized estimates and calculated points are ineligible. Flat RSI is 50. MACD's signal and histogram require 34 contiguous periods. Listing counts, when available in the same period as a selected report, are counts of listings, not transaction volume.

Device-local preferences include indicator toggles, individual colors, pane sizes and selected series. Indicator setting changes and refreshes preserve the chart's visible range. Different instruments or periods reset the range. Native modal controls support keyboard dismissal and responsive phone layouts retain price, source period and check status.

## Updates and verification

The collector uses Python's standard library and checks public project pages hourly (GitHub scheduled runs are best effort, not an exact service guarantee). It handles public-page changes and network errors without pretending a successful update. Browser refresh retrieves published snapshots; it does not scrape sources from the client. It refreshes every five minutes while visible and upon returning to the tab.

GitHub's default workflow token does not trigger a second push workflow. Pages therefore also runs after a successful `Update Live Apartment Market` workflow, checks out main and validates the snapshot. A source/member-list change during collection aborts publication of that stale collector result.

Run from repository root:

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/market-core.test.cjs
node --check apartment-lab/app.js
python3 scripts/validate_apartment_data.py
python3 scripts/update_live_market.py
```

## Limits

Public popular prices may lag real negotiations and transactions, and a source may revise the current month. New project history is intentionally short. The dashboard cannot infer transaction volumes, exact market-wide averages or intraday trading signals from these sources. Approximate report points are not substitutes for the original data tables; uncertain legacy references are excluded rather than presented as verified prices.
