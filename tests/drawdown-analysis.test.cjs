const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const ts = require("typescript");

// Execute the same Next.js data modules without introducing a test framework.
function loadModule(filename) {
  const localRequire = createRequire(filename);
  const context = { exports: {}, require: name => {
    const candidate = path.resolve(path.dirname(filename), `${name}.ts`);
    return name.startsWith(".") && fs.existsSync(candidate) ? loadModule(candidate) : localRequire(name);
  } };
  const javascript = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(javascript, context, { filename });
  return context.exports;
}
const analysis = JSON.parse(JSON.stringify(loadModule(path.resolve(__dirname, "../data/drawdown-analysis.ts")).default));
const archive = require("../public/results.json");
const rows = archive.records.filter(row => row.payoutStatus === "cash_reconciled");
const toUnits = value => Math.round(value * 100000);
const sum = (group, field) => group.reduce((total, row) => total + toUnits(row[field]), 0) / 100000;
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);

test("cash trajectory groups every position once at its event reconciliation", () => {
  assert.equal(rows.length, 242);
  assert.equal(analysis.trajectory.length, 175);
  const sourceGroups = new Map();
  for (const row of rows) {
    const key = row.evidence.settlementSequence;
    sourceGroups.set(key, [...(sourceGroups.get(key) || []), row]);
  }
  let cumulative = 0;
  for (const point of analysis.trajectory) {
    const group = sourceGroups.get(point.settlementSequence);
    assert.ok(group.every(row => row.reconciliationTime === point.date));
    assert.equal(point.positionCount, group.length);
    assert.equal(point.incrementalPnlUsd, sum(group, "pnlUsd"));
    cumulative += toUnits(point.incrementalPnlUsd);
    assert.equal(point.cumulativePnlUsd, cumulative / 100000);
  }
  assert.equal(analysis.trajectory.at(-1).cumulativePositionCount, 242);
  assert.equal(analysis.trajectory.at(-1).cumulativePnlUsd, 4.26556);
});

test("pre-outlier, maximum drawdown and peak-to-close are distinct", () => {
  const pre = analysis.preOutlierDrawdown;
  assert.equal(pre.peak.date, "2026-08-03T18:03:25.569399Z");
  assert.equal(pre.peak.cumulativePnlUsd, 23.16021);
  assert.equal(pre.trough.date, "2026-08-07T18:05:02.561825Z");
  assert.equal(pre.trough.cumulativePnlUsd, -2.67691);
  assert.equal(pre.declineUsd, 25.83712);
  assert.equal(pre.positionCount, 43);
  assert.equal(analysis.maximumDrawdown.declineUsd, 34.04419);
  assert.equal(analysis.maximumDrawdown.trough.cumulativePnlUsd, 2.14816);
  assert.equal(analysis.peakToClose.peak.date, "2026-08-10T06:03:02.230616Z");
  assert.equal(analysis.peakToClose.declineUsd, 31.92679);
  assert.equal(analysis.peakToClose.positionCount, 78);
  const exhaustiveDeclines = analysis.trajectory.flatMap((peak, i) => analysis.trajectory.slice(i).map(trough =>
    toUnits(peak.cumulativePnlUsd) - toUnits(trough.cumulativePnlUsd)));
  assert.equal(Math.max(...exhaustiveDeclines) / 100000, analysis.maximumDrawdown.declineUsd);
});

test("exclusion removes only the largest winner and preserves the reconciliation clock", () => {
  const winner = analysis.concentration.largestWinner;
  assert.equal(winner.id, "s01-42421");
  assert.equal(winner.pnlUsd, 30.324);
  for (const point of analysis.trajectory) {
    const excluded = point.settlementSequence >= winner.evidence.settlementSequence ? toUnits(winner.pnlUsd) : 0;
    assert.equal(toUnits(point.cumulativeWithoutLargestWinnerUsd), toUnits(point.cumulativePnlUsd) - excluded);
  }
  assert.equal(analysis.concentration.netPnlWithoutLargestWinnerUsd, -26.05844);
  assert.equal(analysis.concentration.peakWithoutLargestWinnerUsd, 23.16021);
  assert.equal(analysis.concentration.pnlAtFullCohortPeakWithoutLargestWinnerUsd, 5.86835);
});

test("execution and model-error bridges reconcile with fixed quantities and outcomes", () => {
  const groups = [analysis.cashCohort, ...analysis.bySide, analysis.highConfidence, ...analysis.fillWeeks,
    analysis.cashPhases.throughPeak, analysis.cashPhases.afterPeak, analysis.concentration.withoutLargestWinner];
  for (const group of groups) {
    close(group.pnlAtQuotedAskBeforeFeesUsd - group.fillVsAskCostUsd - group.feesUsd, group.netPnlUsd);
    close(group.adverseFillCostUsd - group.favorableFillSavingsUsd, group.fillVsAskCostUsd);
    assert.equal(group.worseThanAskCount + group.betterThanAskCount + group.matchedAskCount, group.count);
    close(group.modelImpliedNetPnlUsd - group.modelOutcomeShortfallUsd, group.netPnlUsd, 0.000011);
    close((group.shareWeightedPayoutRate - group.shareWeightedBreakEvenProbability) * group.shares, group.netPnlUsd);
  }
  assert.equal(analysis.cashCohort.pnlAtQuotedAskBeforeFeesUsd, 14.23);
  assert.equal(analysis.cashCohort.fillVsAskCostUsd, 0.2);
  assert.equal(analysis.cashCohort.feesUsd, 9.76444);
  assert.equal(analysis.cashCohort.modelImpliedNetPnlUsd, 344.87377);
  const no = analysis.bySide.find(group => group.side === "NO");
  assert.equal(no.count, 239);
  assert.equal(no.netPnlUsd, -23.72756);
  close(no.shareWeightedPayoutRate, 0.7824038950536487);
  close(no.shareWeightedBreakEvenProbability, 0.8021855986393991);
  close(analysis.cashCohort.modelImpliedLosingPositions, 2.72936223076807);
});

test("entry weeks partition fills, while shared events are not independent trials", () => {
  assert.deepEqual(analysis.fillWeeks.map(week => [week.startDate, week.count, week.netPnlUsd, week.netPnlWithoutLargestWinnerUsd]), [
    ["2026-07-20", 39, 10.19131, 10.19131], ["2026-07-27", 70, 5.64902, 5.64902],
    ["2026-08-03", 72, 14.61538, -15.70862], ["2026-08-10", 61, -26.19015, -26.19015],
  ]);
  for (const week of analysis.fillWeeks) {
    const group = rows.filter(row => row.fillTime.slice(0, 10) >= week.startDate && row.fillTime.slice(0, 10) <= week.endDate);
    assert.equal(group.length, week.count);
    assert.equal(new Set(group.map(row => `${row.city}|${row.eventDate}`)).size, week.eventCount);
  }
  assert.equal(analysis.eventDependence.eventCount, 175);
  assert.equal(analysis.eventDependence.multiplePositionEventCount, 50);
  assert.equal(analysis.eventDependence.positionsInMultiplePositionEvents, 117);
  assert.equal(analysis.eventDependence.maximumPositionsPerEvent, 4);
});

test("full-archive sensitivity stays distinct from cash-reconciled performance", () => {
  const full = analysis.fullArchiveSensitivity;
  assert.equal(full.count, 257);
  assert.equal(full.cashReconciledCount, 242);
  assert.equal(full.resolvedUnredeemedCount, 15);
  assert.equal(full.netPnlUsd, -9.88066);
  assert.equal(full.resolvedUnredeemedNetPnlUsd, -14.14622);
  close(full.cashReconciledNetPnlUsd + full.resolvedUnredeemedNetPnlUsd, full.netPnlUsd);
  assert.ok(archive.records.filter(row => row.payoutStatus === "resolved_unredeemed").every(row => row.reconciliationTime === null));
});
