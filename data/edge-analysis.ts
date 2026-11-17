import archive from "../public/results.json";
import reconciled from "./reconciled-results";

type Trade = (typeof archive.records)[number];
const records = reconciled.records;
const dayMs = 86400000;
const units = (value: number) => Math.round(value * 100000);
const total = (rows: Trade[]) => rows.reduce((sum, row) => sum + units(row.pnlUsd), 0) / 100000;
const eventCount = (rows: Trade[]) => new Set(rows.map(row => `${row.city}|${row.eventDate}`)).size;
const largestWinner = records.reduce((best, row) => row.pnlUsd > best.pnlUsd ? row : best);
const withoutWinner = (rows: Trade[]) => rows.filter(row => row.id !== largestWinner.id);
const dateAfter = (date: string, days: number) => new Date(Date.parse(date) + days * dayMs).toISOString().slice(0, 10);
const calendarDays = (first: string, last: string) => Math.round((Date.parse(last) - Date.parse(first)) / dayMs) + 1;

const groupedDates = new Map<string, Trade[]>();
for (const row of records) {
  const group = groupedDates.get(row.eventDate) ?? [];
  group.push(row);
  groupedDates.set(row.eventDate, group);
}
const dateBlocks = [...groupedDates].sort(([a], [b]) => a.localeCompare(b)).map(([date, rows]) => ({
  date, positionCount: rows.length, cityDateCount: eventCount(rows),
  netPnlUsd: total(rows), netPnlWithoutLargestWinnerUsd: total(withoutWinner(rows)),
}));
const blockCount = dateBlocks.length;
const meanPnlUsd = total(records) / blockCount;
const sampleStdDevUsd = Math.sqrt(dateBlocks.reduce((sum, block) => sum + (block.netPnlUsd - meanPnlUsd) ** 2, 0) / (blockCount - 1));
const standardErrorUsd = sampleStdDevUsd / Math.sqrt(blockCount);
const degreesOfFreedom = blockCount - 1;
// Student-t inverse CDF(.975, 24), independently checked by density integration.
// This fixed reference belongs to the frozen 25-date archive, not arbitrary data.
if (degreesOfFreedom !== 24) throw new Error("Recalculate the reference t critical value when the archived date count changes.");
const criticalT95 = 2.0638985616280205;

const fillDates = records.map(row => row.fillTime.slice(0, 10)).sort();
const startDate = fillDates[0];
const endDate = fillDates[fillDates.length - 1];
const calendarDayCount = calendarDays(startDate, endDate);
// Determine the split from elapsed calendar days, never from P&L or cash peaks.
const boundaryDate = dateAfter(startDate, Math.ceil(calendarDayCount / 2));

function half(rows: Trade[], label: string, first: string, last: string) {
  const group = rows.filter(row => row.fillTime.slice(0, 10) >= first && row.fillTime.slice(0, 10) <= last);
  const winningPositions = group.filter(row => row.outcome === 1).length;
  return {
    label, startDate: first, endDate: last, calendarDayCount: calendarDays(first, last),
    count: group.length, eventCount: eventCount(group), netPnlUsd: total(group),
    netPnlWithoutLargestWinnerUsd: total(withoutWinner(group)), winningPositions,
    winRate: winningPositions / group.length,
    meanModelProbability: group.reduce((sum, row) => sum + row.modelProbability, 0) / group.length,
  };
}
function halves(rows: Trade[], lastDate: string) {
  return [half(rows, "Earlier entries", startDate, dateAfter(boundaryDate, -1)),
    half(rows, "Later entries", boundaryDate, lastDate)];
}
function winnerExclusions(rows: Trade[]) {
  const winners = rows.filter(row => row.pnlUsd > 0).sort((a, b) => b.pnlUsd - a.pnlUsd);
  return [0, 1, 5, 10].map(removedCount => ({
    removedCount, removedPnlUsd: total(winners.slice(0, removedCount)),
    remainingCount: rows.length - removedCount,
    remainingPnlUsd: (units(total(rows)) - units(total(winners.slice(0, removedCount)))) / 100000,
  }));
}
const fullLastFillDate = archive.records.map(row => row.fillTime.slice(0, 10)).sort().at(-1)!;

export default {
  dateBlocks,
  dateSummary: {
    blockCount, positionCount: records.length,
    firstDate: dateBlocks[0].date, lastDate: dateBlocks[blockCount - 1].date,
    totalPnlUsd: total(records), meanPnlUsd, sampleStdDevUsd, standardErrorUsd,
    tStatistic: meanPnlUsd / standardErrorUsd, degreesOfFreedom, criticalT95,
    referenceInterval95Usd: {
      lower: meanPnlUsd - criticalT95 * standardErrorUsd,
      upper: meanPnlUsd + criticalT95 * standardErrorUsd,
    },
    positiveBlockCount: dateBlocks.filter(block => block.netPnlUsd > 0).length,
    negativeBlockCount: dateBlocks.filter(block => block.netPnlUsd < 0).length,
    zeroBlockCount: dateBlocks.filter(block => block.netPnlUsd === 0).length,
  },
  entrySplit: {
    startDate, endDate, boundaryDate, calendarDayCount,
    method: "Split the displayed cohort's inclusive fill-date range into equal calendar halves, assigning an odd extra day to the first half. The rule was selected retrospectively, without using P&L or a cash-curve turning point.",
  },
  entryHalves: halves(records, endDate),
  winnerExclusions: winnerExclusions(records),
  fullArchiveSensitivity: {
    count: archive.records.length, netPnlUsd: total(archive.records),
    resolvedUnredeemedCount: archive.payoutCoverage.resolvedUnredeemed.count,
    boundaryDate,
    entryHalves: halves(archive.records, fullLastFillDate),
    winnerExclusions: winnerExclusions(archive.records),
  },
  methodology: {
    dateBlocks: "Sum original-fee position P&L across every city and position sharing the contract's local weather event-date label. These are retrospective outcome totals, not daily cash receipts or synchronized UTC risk intervals.",
    tStatistic: "For the 25 date totals: t = mean / (sample standard deviation / sqrt(25)), relative to a zero mean. The conventional 95% reference interval is mean ± t(.975,24) × standard error, in dollars per observed event-date block.",
    assumptions: [
      "The reference interval would require independent, approximately normal date totals from a stable population. These assumptions have not been established; 25 blocks, a large outlier, changing exposures and possible serial weather dependence make its nominal coverage unreliable.",
      "Grouping whole dates preserves shared-event and same-date exposure within each observation. It does not remove dependence across dates or estimate an effective sample size.",
      "The observed sample is selected by execution and cash reconciliation. It omits eligible untraded opportunities and the 15 resolved positions without archived cash reconciliation. It is not a random sample of all opportunities.",
      "A t-statistic near zero indicates that this observed mean is small relative to this standard-error calculation. It is not the probability of an edge, a coin-flip verdict, or evidence that the true mean is exactly zero.",
    ],
    chronologicalSplit: "Fill timestamps define entry cohorts in UTC, with eventual outcomes attributed back to entry. Calendar endpoints are partial days. Both halves have already been observed; this is a retrospective persistence check, not an untouched holdout or a statistically identified onset date. City–date exposures can cross entry boundaries.",
    fullArchiveSensitivity: "The full archive keeps the same August 3 entry boundary and adds the later August 16–17 fills to the second group. Its later group is longer, and its P&L includes verified unredeemed settlement value rather than cash alone.",
    winnerExclusions: "Rank positive position P&Ls within each displayed population and remove the largest 1, 5 or 10. This is hindsight concentration sensitivity, not an unbiased strategy estimate or a resimulation of capital and execution.",
    unperformedChecks: [
      "No weekday-label permutation or simulated p-value is reported. There is no specified weekday strategy hypothesis or exported eligible-untraded baseline, and exchangeability across changing weather dates is unverified. A valid within-executed-sample weekday test would require its own prespecified statistic and null.",
      "Reordering P&L observations leaves their total unchanged, so a shuffled order is not a significance test for total profit.",
    ],
    sources: [
      { title: "NIST: Confidence limits for the mean", url: "https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm" },
      { title: "NIST: Student-t critical values", url: "https://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm" },
    ],
  },
};
