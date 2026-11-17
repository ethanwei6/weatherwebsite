import archive from "../public/results.json";
import reconciled from "./reconciled-results";

type Trade = (typeof reconciled.records)[number];
const records = reconciled.records;
const units = (value: number) => Math.round(value * 100000);
const rounded = (value: number) => units(value) / 100000;
const sumMoney = (rows: Trade[], value: (row: Trade) => number) =>
  rows.reduce((sum, row) => sum + units(value(row)), 0) / 100000;
const eventKey = (row: Trade) => `${row.city}|${row.eventDate}`;
const largestWinner = records.reduce((best, row) => row.pnlUsd > best.pnlUsd ? row : best);
const topFiveIds = new Set([...records].sort((a, b) => b.pnlUsd - a.pnlUsd).slice(0, 5).map(row => row.id));

function statistics(rows: Trade[]) {
  const count = rows.length;
  const mean = (value: (row: Trade) => number) => rows.reduce((sum, row) => sum + value(row), 0) / count;
  const shares = sumMoney(rows, row => row.shares);
  const entryCostUsd = sumMoney(rows, row => row.costUsd);
  const payoutUsd = sumMoney(rows, row => row.payoutUsd);
  const quoteNotionalUsd = sumMoney(rows, row => row.shares * row.quotedAsk);
  const modelPayout = rows.reduce((sum, row) => sum + row.shares * row.modelProbability, 0);
  const meanModelProbability = mean(row => row.modelProbability);
  return {
    count,
    eventCount: new Set(rows.map(eventKey)).size,
    winningPositions: rows.filter(row => row.outcome === 1).length,
    losingPositions: rows.filter(row => row.outcome === 0).length,
    modelImpliedLosingPositions: count * (1 - meanModelProbability),
    netPnlUsd: sumMoney(rows, row => row.pnlUsd),
    netPnlWithoutLargestWinnerUsd: sumMoney(rows.filter(row => row.id !== largestWinner.id), row => row.pnlUsd),
    shares, entryCostUsd, payoutUsd,
    meanModelProbability,
    observedWinRate: mean(row => row.outcome),
    meanBreakEvenProbability: mean(row => row.costUsd / row.shares),
    shareWeightedModelProbability: modelPayout / shares,
    shareWeightedPayoutRate: payoutUsd / shares,
    shareWeightedBreakEvenProbability: entryCostUsd / shares,
    modelBrierScore: mean(row => (row.modelProbability - row.outcome) ** 2),
    askBrierScore: mean(row => (row.quotedAsk - row.outcome) ** 2),
    feesUsd: sumMoney(rows, row => row.feeUsd),
    fillVsAskCostUsd: sumMoney(rows, row => row.shares * (row.fillPrice - row.quotedAsk)),
    adverseFillCostUsd: sumMoney(rows, row => row.shares * Math.max(0, row.fillPrice - row.quotedAsk)),
    favorableFillSavingsUsd: sumMoney(rows, row => row.shares * Math.max(0, row.quotedAsk - row.fillPrice)),
    worseThanAskCount: rows.filter(row => units(row.fillPrice - row.quotedAsk) > 0).length,
    betterThanAskCount: rows.filter(row => units(row.fillPrice - row.quotedAsk) < 0).length,
    matchedAskCount: rows.filter(row => units(row.fillPrice - row.quotedAsk) === 0).length,
    pnlAtQuotedAskBeforeFeesUsd: rounded(payoutUsd - quoteNotionalUsd),
    modelImpliedGrossAtAskUsd: rounded(modelPayout - quoteNotionalUsd),
    modelImpliedNetPnlUsd: rounded(modelPayout - entryCostUsd),
    modelOutcomeShortfallUsd: rounded(modelPayout - payoutUsd),
  };
}

const eventGroups = new Map<number, Trade[]>();
for (const row of records) {
  const sequence = row.evidence.settlementSequence!;
  const group = eventGroups.get(sequence) ?? [];
  group.push(row);
  eventGroups.set(sequence, group);
}
let cumulativeUnits = 0;
let withoutWinnerUnits = 0;
let cumulativePositionCount = 0;
const trajectory = [...eventGroups].sort(([a], [b]) => a - b).map(([settlementSequence, rows]) => {
  const incrementalPnlUsd = sumMoney(rows, row => row.pnlUsd);
  cumulativeUnits += units(incrementalPnlUsd);
  withoutWinnerUnits += units(sumMoney(rows.filter(row => row.id !== largestWinner.id), row => row.pnlUsd));
  cumulativePositionCount += rows.length;
  return {
    date: rows[0].reconciliationTime, settlementSequence,
    positionCount: rows.length, cumulativePositionCount, incrementalPnlUsd,
    cumulativePnlUsd: cumulativeUnits / 100000,
    cumulativeWithoutLargestWinnerUsd: withoutWinnerUnits / 100000,
  };
});
export type ReconciliationPoint = (typeof trajectory)[number];

// An event's positions enter together. These are dollar drawdowns of realized
// cohort P&L, not percentage drawdowns of marked-to-market account equity.
function drawdown(points: ReconciliationPoint[]) {
  let runningPeak = points[0];
  let peak = points[0];
  let trough = points[0];
  let declineUsd = 0;
  for (const point of points) {
    if (point.cumulativePnlUsd > runningPeak.cumulativePnlUsd) runningPeak = point;
    const decline = rounded(runningPeak.cumulativePnlUsd - point.cumulativePnlUsd);
    if (decline > declineUsd) {
      peak = runningPeak;
      trough = point;
      declineUsd = decline;
    }
  }
  return { peak, trough, declineUsd, positionCount: trough.cumulativePositionCount - peak.cumulativePositionCount };
}

const peak = trajectory.reduce((best, point) => point.cumulativePnlUsd > best.cumulativePnlUsd ? point : best);
const close = trajectory[trajectory.length - 1];
const winnerIndex = trajectory.findIndex(point => point.settlementSequence === largestWinner.evidence.settlementSequence);

function monday(timestamp: string) {
  const day = new Date(`${timestamp.slice(0, 10)}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  return day.toISOString().slice(0, 10);
}
const weekGroups = new Map<string, Trade[]>();
for (const row of records) {
  const start = monday(row.fillTime);
  const group = weekGroups.get(start) ?? [];
  group.push(row);
  weekGroups.set(start, group);
}
const fillWeeks = [...weekGroups].sort(([a], [b]) => a.localeCompare(b)).map(([startDate, rows]) => {
  const end = new Date(`${startDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  return { startDate, endDate: end.toISOString().slice(0, 10), ...statistics(rows) };
});

const cityDateGroups = new Map<string, Trade[]>();
for (const row of records) {
  const key = eventKey(row);
  const group = cityDateGroups.get(key) ?? [];
  group.push(row);
  cityDateGroups.set(key, group);
}
const eventExposures = [...cityDateGroups.values()].map(rows => ({
  city: rows[0].city, eventDate: rows[0].eventDate, positionCount: rows.length,
  entryCostUsd: sumMoney(rows, row => row.costUsd), netPnlUsd: sumMoney(rows, row => row.pnlUsd),
}));
const cashCohort = statistics(records);

export default {
  cashCohort,
  trajectory,
  preOutlierDrawdown: drawdown(trajectory.slice(0, winnerIndex)),
  maximumDrawdown: drawdown(trajectory),
  peakToClose: { peak, close, declineUsd: rounded(peak.cumulativePnlUsd - close.cumulativePnlUsd),
    positionCount: close.cumulativePositionCount - peak.cumulativePositionCount },
  concentration: {
    largestWinner,
    netPnlWithoutLargestWinnerUsd: cashCohort.netPnlWithoutLargestWinnerUsd,
    netPnlWithoutTopFiveWinnersUsd: sumMoney(records.filter(row => !topFiveIds.has(row.id)), row => row.pnlUsd),
    largestWinnerShareOfGrossProfit: largestWinner.pnlUsd / sumMoney(records.filter(row => row.pnlUsd > 0), row => row.pnlUsd),
    peakWithoutLargestWinnerUsd: Math.max(...trajectory.map(point => point.cumulativeWithoutLargestWinnerUsd)),
    pnlAtFullCohortPeakWithoutLargestWinnerUsd: peak.cumulativeWithoutLargestWinnerUsd,
    beforeLargestWinner: trajectory[winnerIndex - 1],
    afterLargestWinner: trajectory[winnerIndex],
    withoutLargestWinner: statistics(records.filter(row => row.id !== largestWinner.id)),
  },
  fillWeeks,
  bySide: ["YES", "NO"].map(side => ({ side, ...statistics(records.filter(row => row.side === side)) })),
  highConfidence: { minimumModelProbability: 0.98, ...statistics(records.filter(row => row.modelProbability >= 0.98)) },
  cashPhases: {
    throughPeak: statistics(records.filter(row => row.evidence.settlementSequence! <= peak.settlementSequence)),
    afterPeak: statistics(records.filter(row => row.evidence.settlementSequence! > peak.settlementSequence)),
  },
  eventDependence: {
    eventCount: cityDateGroups.size,
    multiplePositionEventCount: eventExposures.filter(event => event.positionCount > 1).length,
    positionsInMultiplePositionEvents: eventExposures.filter(event => event.positionCount > 1).reduce((sum, event) => sum + event.positionCount, 0),
    maximumPositionsPerEvent: Math.max(...eventExposures.map(event => event.positionCount)),
    largestEntryCostEvent: eventExposures.reduce((largest, event) => event.entryCostUsd > largest.entryCostUsd ? event : largest),
    largestRealizedLossEvent: eventExposures.reduce((worst, event) => event.netPnlUsd < worst.netPnlUsd ? event : worst),
  },
  fullArchiveSensitivity: {
    count: archive.records.length,
    cashReconciledCount: cashCohort.count,
    resolvedUnredeemedCount: archive.payoutCoverage.resolvedUnredeemed.count,
    netPnlUsd: archive.metrics.netPnlUsd,
    cashReconciledNetPnlUsd: cashCohort.netPnlUsd,
    resolvedUnredeemedNetPnlUsd: archive.payoutCoverage.resolvedUnredeemed.netPnlUsd,
    claimablePayoutUsd: archive.payoutCoverage.resolvedUnredeemed.payoutUsd,
    verifiedAt: archive.payoutCoverage.verifiedAt,
  },
  limitations: [
    "The cash trajectory covers 242 selected, executed and cash-reconciled positions; the full 257-position archive has a different settlement-value result.",
    "Cash dates record payout reconciliation, not entry, signal evaluation or when a weakness was recognized. The exact eligibility evaluation timestamp was not serialized.",
    "Entry weeks are Monday–Sunday UTC groups of confirmed fill timestamps, with eventual outcomes assigned retrospectively. Boundary weeks are partial; event counts can overlap between weeks.",
    "Peak, trough and largest-winner exclusions are selected after observing outcomes. They diagnose concentration and drawdown, not a predeclared strategy change or a profitable alternative policy.",
    "The aligned exclusion curve removes only one position's P&L. It does not resimulate capital, sizing, order availability or later trades.",
    "Quoted-ask accounting holds recorded quantities and outcomes fixed. It is not a simulation of available fills; the signed fill-versus-ask cost is a net of improvements and adverse differences.",
    "Model-implied P&L applies recorded probabilities to purchased quantities. It is conditional forecast arithmetic, not evidence of attainable profit or calibrated expectations.",
    "Unweighted probability and win-rate statistics describe positions. Share-weighted payout and break-even rates use the same quantity weights and reconcile to dollar P&L; an unweighted gap need not have the same sign.",
    "Shared city–date positions have common weather exposure. The grouping counts do not estimate a correlation coefficient or justify independent-trial uncertainty estimates; event entry cost is not joint worst-case loss.",
    "All results retain original recorded fill fees and exclude gas, taxes, later cost corrections and technical-canary trades. The P&L curve starts at zero and is not account equity or percentage return.",
  ],
};
