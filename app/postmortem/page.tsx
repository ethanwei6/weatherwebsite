"use client";

import { useState, type PointerEvent } from "react";
import analysis from "../../data/drawdown-analysis";
import results from "../../data/reconciled-results";
import evaluation from "../../public/model-evaluation.json";
import "./postmortem.css";

const { trajectory, concentration, preOutlierDrawdown, maximumDrawdown, peakToClose } = analysis;
const { metrics, cohort, payoutCoverage } = results;
const winner = concentration.largestWinner;
const noPositions = analysis.bySide.find(group => group.side === "NO")!;
const close = trajectory[trajectory.length - 1];
const usd = (value: number, digits = 2) => `$${Math.abs(value).toFixed(digits)}`;
const signed = (value: number, digits = 2) => `${value < 0 ? "−" : "+"}${usd(value, digits)}`;
const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const day = (date: string) => dateFormat.format(new Date(date));
const firstTime = Date.parse(trajectory[0].date);
const start = firstTime - 86400000;
const end = Date.parse(close.date);
const x = (date: string) => (Date.parse(date) - start) / (end - start) * 100;
const low = Math.floor(Math.min(0, ...trajectory.map(point => point.cumulativeWithoutLargestWinnerUsd)) / 10) * 10;
const high = Math.ceil(Math.max(0, ...trajectory.map(point => point.cumulativePnlUsd)) / 10) * 10;
const y = (value: number) => (high - value) / (high - low) * 100;
const ticks = Array.from({ length: (high - low) / 10 + 1 }, (_, index) => high - index * 10);
const dates = Array.from({ length: 5 }, (_, index) => new Date(start + (end - start) * index / 4).toISOString());
const path = (field: "cumulativePnlUsd" | "cumulativeWithoutLargestWinnerUsd") =>
  `M0 ${y(0)} ` + trajectory.map(point => `H${x(point.date)} V${y(point[field])}`).join(" ");

function DrawdownChart() {
  const [showComparison, setShowComparison] = useState(true);
  const [index, setIndex] = useState(trajectory.length - 1);
  const selected = trajectory[index];
  const inspectPoint = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const target = (event.clientX - box.left) / box.width * 100;
    setIndex(trajectory.reduce((best, point, current) =>
      Math.abs(x(point.date) - target) < Math.abs(x(trajectory[best].date) - target) ? current : best, 0));
  };

  return <figure className="pm-figure">
    <div className="pm-figure-head">
      <h2>The result depended on one winner</h2>
      <label className="pm-toggle"><input type="checkbox" checked={showComparison} onChange={event => setShowComparison(event.target.checked)}/>Show without largest winner</label>
    </div>
    <div className="pm-key">
      <span><i aria-hidden="true"/>Actual cash-reconciled close<strong>{signed(close.cumulativePnlUsd)}</strong></span>
      <span><i className="pm-key-comparison" aria-hidden="true"/>Close excluding largest winner<strong className="pm-negative">{signed(concentration.netPnlWithoutLargestWinnerUsd)}</strong></span>
    </div>
    <div className="pm-chart">
      <div className="pm-y-ticks" aria-hidden="true">{ticks.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{tick < 0 ? "−" : ""}${Math.abs(tick)}</span>)}</div>
      <div className="pm-chart-body" role="slider" tabIndex={0}
        aria-label="Cumulative cash P&L at each reconciliation. Use arrow keys to inspect events."
        aria-valuemin={1} aria-valuemax={trajectory.length} aria-valuenow={index + 1}
        aria-valuetext={`${day(selected.date)}, ${selected.date.slice(11, 16)} UTC. Actual ${signed(selected.cumulativePnlUsd)}. Without largest winner ${signed(selected.cumulativeWithoutLargestWinnerUsd)}.`}
        onPointerMove={inspectPoint} onPointerDown={inspectPoint}
        onPointerLeave={event => { if (event.pointerType === "mouse") setIndex(trajectory.length - 1); }}
        onKeyDown={event => {
          const next = { ArrowLeft: index - 1, ArrowDown: index - 1, ArrowRight: index + 1, ArrowUp: index + 1, Home: 0, End: trajectory.length - 1 }[event.key];
          if (next === undefined) return;
          event.preventDefault();
          setIndex(Math.max(0, Math.min(trajectory.length - 1, next)));
        }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {ticks.map(tick => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} className={tick === 0 ? "pm-zero" : "pm-grid"}/>)}
          <line x1={x(winner.reconciliationTime)} x2={x(winner.reconciliationTime)} y1="0" y2="100" className="pm-event-line"/>
          {showComparison && <path d={path("cumulativeWithoutLargestWinnerUsd")} className="pm-curve pm-comparison"/>}
          <path d={path("cumulativePnlUsd")} className="pm-curve"/>
          <line x1={x(selected.date)} x2={x(selected.date)} y1="0" y2="100" className="pm-cursor"/>
        </svg>
        <span className="pm-plot-label" style={{ left: `${x(winner.reconciliationTime)}%` }} aria-hidden="true">Largest winner reconciled</span>
        <i className="pm-point" style={{ left: `${x(selected.date)}%`, top: `${y(selected.cumulativePnlUsd)}%` }} aria-hidden="true"/>
        {showComparison && <i className="pm-point pm-point-comparison" style={{ left: `${x(selected.date)}%`, top: `${y(selected.cumulativeWithoutLargestWinnerUsd)}%` }} aria-hidden="true"/>}
        <div className="pm-x-ticks" aria-hidden="true">{dates.map(date => <span key={date} style={{ left: `${x(date)}%` }}>{day(date)}</span>)}</div>
      </div>
    </div>
    <figcaption>
      <div className="pm-reading"><span>{day(selected.date)}, {selected.date.slice(11, 16)} UTC · {selected.cumulativePositionCount} positions reconciled</span><span>Actual <strong>{signed(selected.cumulativePnlUsd)}</strong> · Without winner <strong>{signed(selected.cumulativeWithoutLargestWinnerUsd)}</strong></span></div>
      <p>The dashed line removes the {signed(winner.pnlUsd)} contribution of <a href={`/trades?trade=${winner.id}`}>{winner.title}</a> at its reconciliation time. It keeps every other trade unchanged. This is a retrospective concentration check, not a simulated alternative strategy.</p>
    </figcaption>
    <div className="pm-drawdowns">
      <section><h3>Weakness before the largest winner</h3><p>The curve fell from <strong>{signed(preOutlierDrawdown.peak.cumulativePnlUsd)}</strong> on {day(preOutlierDrawdown.peak.date)} to <strong>{signed(preOutlierDrawdown.trough.cumulativePnlUsd)}</strong> on {day(preOutlierDrawdown.trough.date)}: a <strong>{usd(preOutlierDrawdown.declineUsd)}</strong> drawdown before the outlier arrived.</p></section>
      <section><h3>The peak did not hold</h3><p>After reaching <strong>{signed(peakToClose.peak.cumulativePnlUsd)}</strong> on {day(peakToClose.peak.date)}, the curve gave back <strong>{usd(peakToClose.declineUsd)}</strong> by the close. The largest peak-to-trough cash drawdown was <strong>{usd(maximumDrawdown.declineUsd)}</strong>.</p></section>
    </div>
    <p className="pm-small pm-axis-note">Dates mark cash reconciliation, not entry, market repricing, or when I recognized deterioration. The series includes recorded fill fees and excludes gas and taxes.</p>
  </figure>;
}

function EntryWeeks() {
  return <section className="pm-section" aria-labelledby="entry-weeks">
    <div className="pm-section-head"><h2 id="entry-weeks">When were the profitable trades entered?</h2><a href="/trades">Inspect the trade ledger →</a></div>
    <p>Fixed Monday–Sunday UTC cohorts use fill time; their outcomes were reconciled later. These calendar boundaries were not chosen around turning points in the cash curve.</p>
    <div className="pm-table-wrap"><table className="data-table">
      <thead><tr><th scope="col">Entry week</th><th scope="col">Positions</th><th scope="col">City–date events</th><th scope="col">Cash P&amp;L</th><th scope="col">Without largest winner</th></tr></thead>
      <tbody>{analysis.fillWeeks.map(week => <tr key={week.startDate}>
        <th scope="row">{day(week.startDate)}–{day(week.endDate)}</th><td>{week.count}</td><td>{week.eventCount}</td>
        <td className={week.netPnlUsd < 0 ? "negative" : "positive"}>{signed(week.netPnlUsd)}</td>
        <td className={week.netPnlWithoutLargestWinnerUsd < 0 ? "negative" : "positive"}>{signed(week.netPnlWithoutLargestWinnerUsd)}</td>
      </tr>)}</tbody>
    </table></div>
    <p className="pm-small">The first two entry weeks were profitable in this sample. The August 3 week becomes negative without the largest winner, and the August 10 week is negative either way. The first and last calendar weeks are partial. These four small cohorts do not establish a durable edge or locate a regime change.</p>
  </section>;
}

function Findings() {
  return <section className="pm-section" aria-labelledby="findings">
    <h2 id="findings">What the evidence supports</h2>
    <div className="pm-findings">
      <section className="pm-finding"><h3>Concentration made the close fragile</h3><div><p>A single position earned {signed(winner.pnlUsd)}; the other {metrics.count - 1} together lost {usd(concentration.netPnlWithoutLargestWinnerUsd)}. Removing the five largest winners gives {signed(concentration.netPnlWithoutTopFiveWinnersUsd)}.</p><p className="pm-small">Sensitivity to winning tails matters, but deleting winners after seeing outcomes is not an unbiased estimate of future returns.</p></div></section>
      <section className="pm-finding"><h3>Confidence exceeded the observed hit rate</h3><div><p>The model assigned an average purchased-side win probability of <strong>{percent(metrics.meanModelProbability)}</strong>. The observed win rate was <strong>{percent(metrics.winRate)}</strong> across {metrics.count} selected executions.</p><p className="pm-small">This is evidence of overconfidence within the executed sample. A forecast distribution that is too narrow could understate tail events; selecting the highest estimated edges could also select the largest probability errors. Both are hypotheses to test. Shared city–date events and selection limit generalization.</p></div></section>
      <section className="pm-finding"><h3>Frequent wins did not cover the losses</h3><div><p>{noPositions.count} of {metrics.count} positions bought NO and together lost <strong>{usd(noPositions.netPnlUsd)}</strong>. Their share-weighted payout rate was <strong>{percent(noPositions.shareWeightedPayoutRate)}</strong>, below the <strong>{percent(noPositions.shareWeightedBreakEvenProbability)}</strong> required to cover actual fills and fees.</p><p className="pm-small">A binary share bought near $1 offers little upside when correct but loses its full cost when wrong. The problem is price relative to reliable probability; buying NO is not inherently unprofitable. These payout and break-even rates use the same share weights, unlike the position-level calibration comparison above.</p></div></section>
      <section className="pm-finding"><h3>Weather accuracy was not enough</h3><div><p>In the archived model-family audit, payout Brier score was <strong>{evaluation.marketDiagnostic.candidate.brier.toFixed(5)}</strong> for the candidate and <strong>{evaluation.marketDiagnostic.marketMidpoint.brier.toFixed(5)}</strong> for the market midpoint; lower is better. Both geographic holdout gates also failed.</p><p className="pm-small">The July 7 historical audit is separate from this trading run and is not a fixed-S01 profitability backtest. It supports testing market-relative edge rather than relying on weather accuracy alone. <a href="/methodology#validation">Read the validation evidence →</a></p></div></section>
    </div>
    <div className="pm-costs"><h3>Separating price, fees and outcomes</h3>
      <p className="pm-cost-equation"><span>{signed(analysis.cashCohort.pnlAtQuotedAskBeforeFeesUsd)} at quoted asks</span><span>{signed(-analysis.cashCohort.fillVsAskCostUsd)} fill/ask difference</span><span>{signed(-analysis.cashCohort.feesUsd)} fees</span><strong>= {signed(metrics.netPnlUsd)}</strong></p>
      <p>This accounting holds actual quantities and realized payouts fixed. Without the largest winner, the result at quoted asks before fees was already <strong>{signed(concentration.withoutLargestWinner.pnlAtQuotedAskBeforeFeesUsd)}</strong>. Costs alone do not explain the remaining losses. The fill/ask difference nets improvements against adverse fills; quoted-ask accounting does not establish that those fills were available.</p>
    </div>
  </section>;
}

export default function PostmortemPage() {
  return <article className="pm-page">
    <header className="page-heading"><div><h1>Postmortem</h1><p>What the July–August 2026 drawdown revealed, and what I would test next.</p></div></header>
    <div className="pm-intro">
      <p>I recognized that the strategy was weakening and kept a small experiment running with limited personal capital to collect diagnostic data. The positive closing cash result needs that context: earlier profitable trades were followed by losses, and one large winner materially changed the outcome.</p>
      <aside className="pm-scope" aria-label="Analysis scope"><p>This analysis covers <strong>{metrics.count} cash-reconciled positions</strong> from {cohort.nonCanaryBuyRecords} archived buys. The other {payoutCoverage.resolvedUnredeemed.count} positions were resolved but unredeemed at the {day(payoutCoverage.verifiedAt)}, 2026 verification.</p><p>Including their settlement value, the full archive was <strong>{signed(analysis.fullArchiveSensitivity.netPnlUsd)}</strong>. They are excluded from this cash curve. <a href="/methodology#evidence">Accounting and scope →</a></p></aside>
    </div>
    <DrawdownChart/>
    <EntryWeeks/>
    <Findings/>
    <section className="pm-section pm-next" aria-labelledby="next-tests">
      <h2 id="next-tests">What I would test next</h2>
      <div><p>These are proposed research steps. The results above do not demonstrate that the weaknesses have been repaired.</p><ol>
        <li><div><h3>Calibrate the probabilities before filtering trades</h3><p>Audit station, date and settlement-bucket definitions at S01’s one- and two-day horizons. Test residual-width adjustments and held-out probability recalibration, then evaluate on later untouched events. Retain rejected candidates to compare calibration before and after the confidence filter. Use chronological splits, city–date grouping and purged label overlap; compare with the contemporaneous market.</p></div></li>
        <li><div><h3>Require an edge after executable costs</h3><p>Use recalibrated probabilities to test a conservative edge threshold after spread, fees and size-dependent fills. Retain decision-time depth, quote age and no-fill cases. Report results by prespecified price, side and horizon groups; require the result to survive realistic execution rather than a quoted-ask calculation.</p></div></li>
        <li><div><h3>Freeze a prospective experiment and its limits</h3><p>Freeze the model, thresholds and evaluation window before collecting a new shadow sample. Evaluate joint city–date payoff scenarios and cap shared-event exposure. Set capital and stopping rules before any further live experiment; assess calibration, outlier dependence and drawdown alongside average returns. Treat station mismatch or regime change as hypotheses until tested.</p></div></li>
      </ol></div>
    </section>
    <details className="pm-disclosure"><summary>Definitions, evidence and limits</summary><div>
      <p>Each cash step records payout minus the original filled notional and trading fee for newly reconciled positions. The chart has {trajectory.length} reconciliation events; it is not a mark-to-market account equity curve. Entry cost is turnover, not a measure of starting capital.</p>
      <p>The entry-week view groups positions by their actual fill timestamps, then assigns their eventual reconciled P&amp;L to that week. City–date counts describe shared weather events, not independent trials; the same event can appear in more than one entry week.</p>
      <p>The continuation rationale is my retrospective account. The data do not identify an exact date when I recognized weakness or establish a precommitted experiment budget. The numerical analysis does not establish the cause of the deterioration.</p>
      <p>Method references: <a href="https://scikit-learn.org/stable/modules/calibration.html">probability calibration and held-out calibration data</a>; <a href="https://scikit-learn.org/stable/modules/cross_validation.html">validation with time dependence and grouped observations</a>.</p>
      <p><a href="/results.json" download>Download the full {cohort.nonCanaryBuyRecords}-position archive</a> · <a href="/methodology#evidence">Review the cash-cohort definition</a> · <a href="/model">Inspect the model and trader</a></p>
    </div></details>
  </article>;
}
