const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../apartment-lab/market-core.js');
const point = (period, value, quality = 'PROVIDER_STATISTIC') => ({period, value, quality});

test('periods use real dates and no weekly observations are created', () => {
  assert.equal(C.periodDate('2025-Q3'), '2025-07-01');
  assert.equal(C.periodDate('2026-10'), '2026-10-01');
  assert.equal(C.periodDate('unknown'), null);
  assert.deepEqual(C.regularRows([point('2026-10', 92.08)], 'W1'), []);
  const quarterly = C.reportSeries({frequency: 'Q1', points: [point('2025-Q1', 80), point('2025-Q2', 85)]}, 'M1');
  assert.deepEqual(quarterly.map(r => r.period), ['2025-Q1', '2025-Q2']);
});
test('missing months remain whitespace, coarse views show last actual observation', () => {
  const points = [point('2026-07', 100), point('2026-09', 94)];
  const rows = C.regularRows(points, 'M1');
  assert.deepEqual(rows.map(r => r.value), [100, null, 94]);
  assert.deepEqual(C.asLineData(rows, rows.map(r => r.value))[1], {time: '2026-08-01'});
  const coarse = C.regularRows(points, 'Q1');
  assert.equal(coarse.length, 1); assert.equal(coarse[0].value, 94);
  assert.equal(coarse[0].originalPeriod, '2026-09');
  assert.equal(coarse[0].open, undefined);
  assert.deepEqual(C.contiguousSegments(rows.map(r => r.value)), [{from: 0, to: 0}, {from: 2, to: 2}]);
  assert.deepEqual(C.contiguousSegments([1, 2, null, 4, 5, null]), [{from: 0, to: 1}, {from: 3, to: 4}]);
});
test('project history excludes calibrated legacy prices and deduplicates source months', () => {
  const project = {id: 'smart', price: 92.08, sourcePeriod: '2026-10', methodVersion: 'PROJECT_UNIT_PRICE_V2'};
  const history = {projects: {smart: [
    {price: 80.5, sourcePeriod: '2026-08', methodVersion: 'V1'},
    {price: 93.06, sourcePeriod: '2026-09', methodVersion: 'PROJECT_UNIT_PRICE_V2'},
    {...project, price: 9208},
  ]}};
  assert.deepEqual(C.projectSeries(project, history).map(r => r.value), [93.06, 92.08]);
  assert.deepEqual(C.basketSeries({history: [{sourcePeriod: '2026-08', price: 56.52, methodVersion: 'V1'}]}), []);
});
test('SMA and EMA restart after missing observations, length 100 needs 100 actual periods', () => {
  assert.deepEqual(C.sma([1, 2, null, 10, 12, 14], 2), [null, 1.5, null, null, 11, 13]);
  assert.deepEqual(C.ema([1, 2, null, 10, 12, 14], 2), [null, 1.5, null, null, 11, 13]);
  assert.ok(C.sma(Array(99).fill(90), 100).every(x => x === null));
  assert.equal(C.ema(Array(100).fill(90), 100).at(-1), 90);
});
test('flat RSI is neutral, increasing and decreasing RSI are bounded', () => {
  assert.equal(C.rsi(Array(15).fill(90)).at(-1), 50);
  assert.equal(C.rsi(Array.from({length: 15}, (_, i) => i + 1)).at(-1), 100);
  assert.equal(C.rsi(Array.from({length: 15}, (_, i) => 100 - i)).at(-1), 0);
  const values = [...Array(15).fill(90), null, ...Array(14).fill(95)];
  assert.equal(C.rsi(values).at(-1), null);
});
test('MACD waits for the signal seed and never compacts gaps', () => {
  const values = Array.from({length: 34}, (_, i) => 50 + i);
  assert.equal(C.macd(values).histogram[32], null);
  assert.ok(C.finite(C.macd(values).histogram[33]));
  assert.equal(C.macd([...values, null, ...values.slice(0, 33)]).histogram.at(-1), null);
});
test('forecast and calculated points are excluded from indicators', () => {
  const rows = [point('2026-01', 85), point('2026-02', 86, 'CALCULATED'), point('2026-03', 95, 'PROVIDER_ESTIMATE'), point('2026-04', 97, 'APPROX_DIGITIZED')];
  assert.deepEqual(C.indicatorInputs(rows), [85, null, null, null]);
  assert.equal(C.contiguousTail(C.indicatorInputs(rows)), 0);
});
test('Bollinger uses valid windows, no zero substituted for missing values', () => {
  assert.deepEqual(C.bb([90, 90, null, 95, 95], 2), {mid: [null, 90, null, null, 95], upper: [null, 90, null, null, 95], lower: [null, 90, null, null, 95]});
});
test('source links and period age are validated', () => {
  assert.equal(C.safeSourceUrl('javascript:alert(1)'), null);
  assert.equal(C.safeSourceUrl('https://onehousing.vn.evil.example/'), null);
  assert.equal(C.safeSourceUrl('https://onehousing.vn/project'), 'https://onehousing.vn/project');
  assert.equal(C.monthAge('2026-08', '2026-10-04'), 2);
  assert.equal(C.monthAge('bad', '2026-10-04'), null);
  assert.equal(C.finite('92.08'), false);
});
