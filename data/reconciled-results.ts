import archive from "../public/results.json";

// One display scope for the chart, attribution, calibration and trade ledger.
// The complete 257-position audit remains available in results.json.
const records = archive.records.filter(
  (row): row is typeof row & { reconciliationTime: string } =>
    row.payoutStatus === "cash_reconciled" && row.reconciliationTime !== null,
);
type Trade = (typeof records)[number];
const money = (rows: Trade[], field: "pnlUsd" | "notionalUsd" | "feeUsd" | "costUsd" | "payoutUsd") =>
  rows.reduce((sum, row) => sum + Math.round(row[field] * 100000), 0) / 100000;

function metrics(rows: Trade[]) {
  const count = rows.length;
  const grossProfitUsd = money(rows.filter(row => row.pnlUsd > 0), "pnlUsd");
  const grossLossAbsUsd = -money(rows.filter(row => row.pnlUsd < 0), "pnlUsd");
  const netPnlUsd = money(rows, "pnlUsd");
  const mean = (value: (row: Trade) => number) => rows.reduce((sum, row) => sum + value(row), 0) / count;
  return {
    count, winningPositions: rows.filter(row => row.pnlUsd > 0).length,
    losingPositions: rows.filter(row => row.pnlUsd < 0).length,
    winRate: mean(row => row.outcome), netPnlUsd,
    notionalUsd: money(rows, "notionalUsd"), feesUsd: money(rows, "feeUsd"),
    entryCostUsd: money(rows, "costUsd"), payoutUsd: money(rows, "payoutUsd"),
    grossProfitUsd, grossLossAbsUsd,
    profitFactor: grossLossAbsUsd ? grossProfitUsd / grossLossAbsUsd : null,
    meanModelProbability: mean(row => row.modelProbability),
    brierScore: mean(row => (row.modelProbability - row.outcome) ** 2),
    meanQuotedAsk: mean(row => row.quotedAsk),
    marketAskBrierScore: mean(row => (row.quotedAsk - row.outcome) ** 2),
    meanPnlUsd: netPnlUsd / count,
  };
}

const breakdown = (field: "side" | "bucketType" | "city") =>
  [...new Set(records.map(row => row[field]))].sort().map(label => ({
    label, ...metrics(records.filter(row => row[field] === label)),
  }));
const winners = records.filter(row => row.pnlUsd > 0).sort((a, b) => b.pnlUsd - a.pnlUsd);
const reconciliations = new Map<number, Trade[]>();
for (const row of records) {
  const sequence = row.evidence.settlementSequence!;
  reconciliations.set(sequence, [...(reconciliations.get(sequence) ?? []), row]);
}
let cumulativeUnits = 0;
let cumulativePositionCount = 0;
const reconciliationPnl = [...reconciliations].sort(([a], [b]) => a - b).map(([, rows]) => {
  const incrementalPnlUsd = money(rows, "pnlUsd");
  cumulativeUnits += Math.round(incrementalPnlUsd * 100000);
  cumulativePositionCount += rows.length;
  return { date: rows[0].reconciliationTime, positionCount: rows.length, incrementalPnlUsd,
    cumulativePnlUsd: cumulativeUnits / 100000, cumulativePositionCount };
});

export default {
  records,
  source: archive.source,
  payoutCoverage: archive.payoutCoverage,
  methodology: archive.methodology,
  cohort: { ...archive.cohort, uniqueCityDates: new Set(records.map(row => `${row.city}|${row.eventDate}`)).size },
  metrics: metrics(records),
  dailyRealizedPnl: archive.dailyRealizedPnl,
  reconciliationPnl,
  breakdowns: { side: breakdown("side"), bucket: breakdown("bucketType"), city: breakdown("city") },
  calibrationBins: archive.calibrationBins.flatMap(bin => {
    const rows = records.filter(row => row.modelProbability >= bin.lower &&
      (row.modelProbability < bin.upper || (bin.upperInclusive && row.modelProbability === bin.upper)));
    return rows.length ? [{ ...bin, count: rows.length,
      meanPredicted: rows.reduce((sum, row) => sum + row.modelProbability, 0) / rows.length,
      observedWinRate: rows.reduce((sum, row) => sum + row.outcome, 0) / rows.length,
    }] : [];
  }),
  robustness: {
    largestWinnerPnlUsd: winners[0].pnlUsd,
    netPnlExcludingLargestWinnerUsd: money(records.filter(row => row.id !== winners[0].id), "pnlUsd"),
    netPnlExcludingTopFiveWinnersUsd: money(records.filter(row => !winners.slice(0, 5).includes(row)), "pnlUsd"),
  },
};
