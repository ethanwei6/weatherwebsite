const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ts = require("typescript");

function loadModule(filename) {
  const localRequire = createRequire(filename);
  const context = { exports: {}, require: name => {
    const candidate = path.resolve(path.dirname(filename), `${name}.ts`);
    return name.startsWith(".") && fs.existsSync(candidate) ? loadModule(candidate) : localRequire(name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, context, { filename });
  return context.exports;
}
const jsonPaths = ["results", "evidence", "model-evaluation"].map(name => path.resolve(__dirname, `../public/${name}.json`));
const before = jsonPaths.map(filename => fs.readFileSync(filename));
const analysis = JSON.parse(JSON.stringify(loadModule(path.resolve(__dirname, "../data/edge-analysis.ts")).default));
const archive = JSON.parse(before[0]);
const records = archive.records.filter(row => row.payoutStatus === "cash_reconciled");
const units = value => Math.round(value * 100000);
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test("whole event dates, not positions or cash dates, form 25 observations", () => {
  assert.equal(analysis.dateBlocks.length, 25);
  assert.equal(analysis.dateSummary.firstDate, "2026-07-23");
  assert.equal(analysis.dateSummary.lastDate, "2026-08-16");
  assert.equal(analysis.dateBlocks.reduce((sum, row) => sum + row.positionCount, 0), 242);
  assert.equal(analysis.dateBlocks.reduce((sum, row) => sum + row.cityDateCount, 0), 175);
  for (const block of analysis.dateBlocks) {
    const rows = records.filter(row => row.eventDate === block.date);
    assert.equal(block.positionCount, rows.length);
    assert.equal(units(block.netPnlUsd), rows.reduce((sum, row) => sum + units(row.pnlUsd), 0));
  }
  assert.equal(analysis.dateBlocks.reduce((sum, row) => sum + units(row.netPnlUsd), 0), 426556);
});

test("reference statistic and interval use sample SD and 24 degrees of freedom", () => {
  const s = analysis.dateSummary;
  assert.equal(s.degreesOfFreedom, 24);
  close(s.meanPnlUsd, 0.1706224);
  close(s.sampleStdDevUsd, 9.075883307529118);
  close(s.standardErrorUsd, 1.8151766615058236);
  close(s.tStatistic, 0.09399768277014763);
  close(s.referenceInterval95Usd.lower, -3.5757181007826215);
  close(s.referenceInterval95Usd.upper, 3.9169629007826217);
  assert.equal(Number(s.criticalT95.toFixed(3)), 2.064);
  assert.ok(s.referenceInterval95Usd.lower < 0 && s.referenceInterval95Usd.upper > 0);
  assert.equal(s.positiveBlockCount + s.negativeBlockCount + s.zeroBlockCount, 25);
  assert.ok(!Object.hasOwn(s, "pValue"));
});

test("calendar midpoint is independent of the peak and partitions confirmed entry dates", () => {
  const split = analysis.entrySplit;
  assert.equal(split.startDate, "2026-07-21");
  assert.equal(split.endDate, "2026-08-15");
  assert.equal(split.boundaryDate, "2026-08-03");
  assert.equal(split.calendarDayCount, 26);
  const [first, second] = analysis.entryHalves;
  assert.equal(first.calendarDayCount, 13);
  assert.equal(second.calendarDayCount, 13);
  assert.deepEqual([first.count, second.count], [109, 133]);
  assert.deepEqual([first.netPnlUsd, second.netPnlUsd], [15.84033, -11.57477]);
  assert.equal(second.netPnlWithoutLargestWinnerUsd, -41.89877);
  const selected = new Set();
  for (const half of analysis.entryHalves) {
    const rows = records.filter(row => row.fillTime.slice(0, 10) >= half.startDate && row.fillTime.slice(0, 10) <= half.endDate);
    assert.equal(rows.length, half.count);
    assert.equal(units(half.netPnlUsd), rows.reduce((sum, row) => sum + units(row.pnlUsd), 0));
    for (const row of rows) { assert.ok(!selected.has(row.id)); selected.add(row.id); }
  }
  assert.equal(selected.size, 242);
});

test("top-ten removal is an exact hindsight concentration sensitivity", () => {
  assert.deepEqual(analysis.winnerExclusions.map(row => [row.removedCount, row.remainingCount, row.remainingPnlUsd]), [
    [0, 242, 4.26556], [1, 241, -26.05844], [5, 237, -31.95298], [10, 232, -38.9946],
  ]);
  const independentlyRanked = records.map(row => row.pnlUsd).filter(pnl => pnl > 0).sort((a, b) => b - a);
  assert.equal(analysis.winnerExclusions[3].removedPnlUsd, 43.26016);
  for (const row of analysis.winnerExclusions) {
    assert.equal(units(row.removedPnlUsd), independentlyRanked.slice(0, row.removedCount).reduce((sum, pnl) => sum + units(pnl), 0));
    assert.equal(units(row.remainingPnlUsd) + units(row.removedPnlUsd), 426556);
  }
});

test("full-archive sensitivity keeps the cash cohort's split boundary", () => {
  const full = analysis.fullArchiveSensitivity;
  assert.equal(full.count, 257);
  assert.equal(full.resolvedUnredeemedCount, 15);
  assert.equal(full.netPnlUsd, -9.88066);
  assert.equal(full.boundaryDate, "2026-08-03");
  const [first, second] = full.entryHalves;
  assert.deepEqual([first.count, second.count], [109, 148]);
  assert.deepEqual([first.netPnlUsd, second.netPnlUsd], [15.84033, -25.72099]);
  assert.equal(second.startDate, "2026-08-03");
  assert.equal(second.endDate, "2026-08-17");
  assert.equal(second.calendarDayCount, 15);
  assert.equal(units(first.netPnlUsd) + units(second.netPnlUsd), units(full.netPnlUsd));
});

test("analysis leaves all original public JSON artifacts unchanged", () => {
  jsonPaths.forEach((filename, i) => assert.ok(fs.readFileSync(filename).equals(before[i])));
});
