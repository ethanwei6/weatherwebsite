"use client";

import { useState, type PointerEvent } from "react";
import { ArrowRight } from "lucide-react";
import results from "../data/reconciled-results";
import "./performance.css";

const { metrics, cohort, robustness, reconciliationPnl, dailyRealizedPnl } = results;
const largestWinner = results.records.reduce((largest, trade) => trade.pnlUsd > largest.pnlUsd ? trade : largest);
const winnerDay = largestWinner.reconciliationTime.slice(0, 10);
const peak = reconciliationPnl.reduce((peak, point) => point.cumulativePnlUsd > peak.cumulativePnlUsd ? point : peak);
const closing = reconciliationPnl[reconciliationPnl.length - 1];
const labeledDays = Array.from({ length: 5 }, (_, i) => dailyRealizedPnl[Math.round(i * (dailyRealizedPnl.length - 1) / 4)]);
const usd = (n: number, digits = 2) => `$${n.toFixed(digits)}`;
const signed = (n: number, digits = 2) => `${n < 0 ? "−" : "+"}${usd(Math.abs(n), digits)}`;
const percent = (n: number, digits = 1) => `${(100 * n).toFixed(digits)}%`;
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => dateFormat.format(new Date(iso));
const timestamp = (iso: string) => Date.parse(iso);
const start = timestamp(dailyRealizedPnl[0].date) - 86400000;
const span = timestamp(closing.date) - start;
const x = (iso: string) => (timestamp(iso) - start) / span * 100;

function PerformanceChart() {
  const [mode, setMode] = useState<"Cumulative" | "Daily">("Cumulative");
  const days = mode === "Cumulative" ? reconciliationPnl : dailyRealizedPnl;
  const lastIndex = days.length - 1;
  const [index, setIndex] = useState(lastIndex);
  const selected = days[index];
  const value = (day: typeof selected) => mode === "Cumulative" ? day.cumulativePnlUsd : day.incrementalPnlUsd;
  const low = Math.floor(Math.min(0, ...days.map(value)) / 10) * 10;
  const high = Math.ceil(Math.max(0, ...days.map(value)) / 10) * 10;
  const y = (dollars: number) => (high - dollars) / (high - low) * 100;
  const ticks = Array.from({ length: (high - low) / 10 + 1 }, (_, i) => high - i * 10);
  const stepPath = `M0 ${y(0)} ` + days.map(day => `H${x(day.date)} V${y(value(day))}`).join(" ");
  const projectedX = (day: typeof selected) => mode === "Cumulative" ? x(day.date) : x(day.date) - 1.4;
  const peakX = x(peak.date);
  const inspectPoint = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const target = (event.clientX - box.left) / box.width * 100;
    const nearest = days.reduce((best, day, i) => Math.abs(projectedX(day) - target) < Math.abs(projectedX(days[best]) - target) ? i : best, 0);
    setIndex(nearest);
  };
  return (
    <figure className="pf-figure">
      <div className="pf-chart-heading">
        <h2>Cash-reconciled P&L</h2>
        <div className="segmented" role="group" aria-label="Chart measure">
          {(["Cumulative", "Daily"] as const).map(option => <button type="button" key={option} aria-pressed={mode === option} onClick={() => { setMode(option); setIndex((option === "Cumulative" ? reconciliationPnl : dailyRealizedPnl).length - 1); }}>{option}</button>)}
        </div>
      </div>
      <div className="pf-figure-values">
        <div className="pf-figure-value"><span>Closing P&L</span><strong>{signed(metrics.netPnlUsd)}</strong><span>{shortDate(closing.date)}, {closing.date.slice(0, 4)} · {metrics.count} positions</span></div>
        <div className="pf-figure-value"><span>Peak P&L</span><strong>{signed(peak.cumulativePnlUsd)}</strong><span>{shortDate(peak.date)}, {peak.date.slice(11, 16)} UTC · After reconciliation</span></div>
      </div>
      <div className="pf-plot">
        <div aria-hidden="true" className="pf-y-ticks">{ticks.map(tick => <span key={tick} style={{ top: `${y(tick)}%` }}>{tick < 0 ? "−" : ""}${Math.abs(tick)}</span>)}</div>
        <div className="pf-plot-body" role="slider" tabIndex={0} aria-label={`${mode} cash-reconciled P&L by reconciliation date`} aria-valuemin={1} aria-valuemax={days.length} aria-valuenow={index + 1} aria-valuetext={`${shortDate(selected.date)}, ${signed(value(selected))}, ${selected.positionCount} positions`}
          onKeyDown={event => {
            const position = { ArrowLeft: index - 1, ArrowDown: index - 1, ArrowRight: index + 1, ArrowUp: index + 1, Home: 0, End: lastIndex }[event.key];
            if (position === undefined) return;
            event.preventDefault();
            setIndex(Math.max(0, Math.min(lastIndex, position)));
          }}
          onPointerMove={inspectPoint} onPointerDown={inspectPoint} onPointerLeave={event => { if (event.pointerType === "mouse") setIndex(lastIndex); }}>
          <svg className="pf-line-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {ticks.map(tick => <line key={tick} x1="0" x2="100" y1={y(tick)} y2={y(tick)} className={tick === 0 ? "pf-zero-line" : "pf-gridline"}/>)}
            {mode === "Cumulative" && <line x1={peakX} x2={peakX} y1="0" y2="100" className="pf-event-line"/>}
            {mode === "Cumulative" ? <path d={stepPath} className="pf-step"/> : days.map(day => <rect key={day.date} x={projectedX(day) - 1} y={Math.min(y(value(day)), y(0))} width="2" height={Math.abs(y(value(day)) - y(0))} fill={value(day) < 0 ? "var(--red)" : "var(--accent)"}/>)}
            {index !== lastIndex && <line x1={projectedX(selected)} x2={projectedX(selected)} y1="0" y2="100" className="pf-cursor-line"/>}
          </svg>
          {mode === "Cumulative" && <><span className="pf-annotation" aria-hidden="true" style={{ left: `${peakX}%` }}>{shortDate(peak.date)} · Peak</span><i aria-hidden="true" className="pf-point pf-peak-point" style={{ left: `${peakX}%`, top: `${y(peak.cumulativePnlUsd)}%` }}/></>}
          <i aria-hidden="true" className="pf-point" style={{ left: `${projectedX(selected)}%`, top: `${y(value(selected))}%` }}/>
          <div className="pf-x-ticks" aria-hidden="true">{labeledDays.map(day => <span key={day.date} style={{ left: `${projectedX(day)}%` }}>{shortDate(day.date)}</span>)}</div>
        </div>
      </div>
      <figcaption>
        <div className="pf-date-reading"><span>{shortDate(selected.date)}{mode === "Cumulative" ? `, ${selected.date.slice(11, 16)} UTC` : ""} · {selected.positionCount} {selected.positionCount === 1 ? "position" : "positions"}</span><span>{mode === "Cumulative" ? `Event ${signed(selected.incrementalPnlUsd)} · Cumulative ${signed(selected.cumulativePnlUsd)}` : `Daily ${signed(selected.incrementalPnlUsd)}`}</span></div>
        Cumulative P&L steps after each cash reconciliation. Daily bars combine reconciliations by UTC date. Figures include recorded trading fees and exclude gas and taxes.
      </figcaption>
      <div className="pf-trade-note">
        <a href={`/trades?trade=${largestWinner.id}`}>{largestWinner.title} <ArrowRight size={14} aria-hidden="true"/></a>
        <p>This position contributed <strong>{signed(largestWinner.pnlUsd)}</strong> to the {shortDate(winnerDay)} result.</p>
        <details className="pf-calibration-details"><summary>Concentration sensitivity</summary><p>Excluding this largest winner gives <strong className="negative">{signed(robustness.netPnlExcludingLargestWinnerUsd)}</strong> for the cash-reconciled cohort.</p></details>
      </div>
    </figure>
  );
}

function ExecutionSummary() {
  const rows = [
    ["City–date events", cohort.uniqueCityDates],
    ["Wins / losses", `${metrics.winningPositions} / ${metrics.losingPositions}`],
    ["Win rate", percent(metrics.winRate, 2)],
    ["Profit factor", metrics.profitFactor?.toFixed(3)],
    ["Trading fees", usd(metrics.feesUsd)],
    ["Entry cost, including fees", usd(metrics.entryCostUsd)],
    ["Reconciled payout", usd(metrics.payoutUsd)],
  ];
  return <aside className="pf-ledger" aria-label="Execution summary">
    <h2>Payout coverage</h2>
    <div className="pf-coverage">
      <p><strong>{metrics.count} cash-reconciled positions</strong> are included in the displayed results.</p>
      <p>The {cohort.missingPayoutChainBuyRecords} positions without archived cash reconciliation are excluded. These figures describe the reconciled subset of {cohort.nonCanaryBuyRecords} buys.</p>
      <a href="/methodology#evidence">Cohort definition and full archive <ArrowRight size={14} aria-hidden="true"/></a>
    </div>
    <dl>{rows.map(([label, number]) => <div key={label}><dt>{label}</dt><dd>{number}</dd></div>)}</dl>
  </aside>;
}

function Attribution() {
  const [group, setGroup] = useState<"side" | "bucket" | "city">("side");
  const rows = [...results.breakdowns[group]].sort((a, b) => b.netPnlUsd - a.netPnlUsd);
  return <section className="pf-attribution">
    <div className="pf-section-heading"><h2>P&L attribution</h2><select aria-label="Group performance by" value={group} onChange={event => setGroup(event.target.value as typeof group)}><option value="side">By side</option><option value="bucket">By bucket</option><option value="city">By city</option></select></div>
    <div className="pf-table-scroll"><table className="data-table"><thead><tr><th scope="col">{group[0].toUpperCase() + group.slice(1)}</th><th scope="col">Trades</th><th scope="col">Win rate</th><th scope="col">Net P&L</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th><td>{row.count}</td><td>{percent(row.winRate)}</td><td className={row.netPnlUsd >= 0 ? "positive" : "negative"}>{signed(row.netPnlUsd)}</td></tr>)}
    </tbody></table></div>
    <p className="pf-note">Cash-reconciled positions are grouped by purchased side, contract bucket, or city and ranked by net P&L after recorded trading fees.</p>
    <a className="pf-text-link" href="/trades">Explore individual trades <ArrowRight size={14} aria-hidden="true"/></a>
  </section>;
}

function Calibration() {
  return <section className="pf-calibration"><h2>Purchased-side calibration</h2>
    <p>The model assigned an average <strong>{percent(metrics.meanModelProbability, 2)}</strong> chance of winning. The purchased side resolved as the winner for <strong>{percent(metrics.winRate, 2)}</strong> of the {metrics.count} positions.</p>
    <div className="pf-reliability-wrap"><span className="pf-axis-title">Observed win frequency</span><svg viewBox="0 0 420 168" role="img" aria-label="Reliability diagram. Mean purchased-side model probability is on the horizontal axis and the observed win frequency is on the vertical axis. Most positions lie in the two highest probability bins.">
      {[0, .5, 1].map(rate => <g key={rate}><line x1="40" x2="392" y1={136 - 116 * rate} y2={136 - 116 * rate} className="pf-gridline"/><text x="30" y={140 - 116 * rate} textAnchor="end">{percent(rate, 0)}</text></g>)}
      {[.7, .8, .9, 1].map(rate => <text key={rate} x={40 + (rate - .7) / .3 * 352} y="160" textAnchor="middle">{percent(rate, 0)}</text>)}
      <line x1="40" x2="392" y1={136 - 116 * .7} y2="20" className="pf-perfect-line"/>
      {results.calibrationBins.map(bin => <circle key={bin.lower} cx={40 + (bin.meanPredicted - .7) / .3 * 352} cy={136 - 116 * bin.observedWinRate} r={3 + Math.sqrt(bin.count) * .45}><title>{`n=${bin.count}, mean probability ${percent(bin.meanPredicted, 2)}, wins ${percent(bin.observedWinRate, 2)}`}</title></circle>)}
    </svg><span className="pf-axis-title">Mean model probability</span></div>
    <div className="pf-plot-key"><span><i/>Observed frequency</span><span><b/>Perfect calibration</span></div>
    <details className="pf-calibration-details"><summary>Calibration bins and Brier scores</summary>
      <div className="pf-table-scroll"><table className="data-table"><thead><tr><th scope="col">Model probability</th><th scope="col">Trades</th><th scope="col">Mean p</th><th scope="col">Win rate</th></tr></thead><tbody>{results.calibrationBins.map(bin => <tr key={bin.lower}><th scope="row">{percent(bin.lower, 0)}–{percent(bin.upper, 0)}</th><td>{bin.count}</td><td>{percent(bin.meanPredicted, 2)}</td><td>{percent(bin.observedWinRate, 2)}</td></tr>)}</tbody></table></div>
      <p className="pf-note">Brier score is {metrics.brierScore.toFixed(5)} for the model and {metrics.marketAskBrierScore.toFixed(5)} for the decision-time ask. Both scores describe selected executions across {cohort.uniqueCityDates} shared city–date events. The ask includes the spread.</p>
    </details>
  </section>;
}

export default function Home() {
  return <div className="pf-page">
    <header className="page-heading"><div><h1>Performance</h1><p>242 cash-reconciled S01 positions in daily high-temperature markets, July–August 2026.</p></div><a className="outline-link" href="/postmortem">Read the drawdown analysis <ArrowRight size={14} aria-hidden="true"/></a></header>
    <div className="pf-lead"><PerformanceChart/><ExecutionSummary/></div>
    <section className="pf-postmortem" aria-labelledby="drawdown-review-title"><div><h2 id="drawdown-review-title">What the drawdown revealed</h2><p>The cash-reconciled curve fell <strong>{usd(peak.cumulativePnlUsd - metrics.netPnlUsd)}</strong> from peak to close. Earlier losses and one unusually large winner make the peak an incomplete measure of performance.</p></div><div><p>I recognized the deterioration. With a small personal stake, I chose to continue collecting execution and settlement data to investigate what was going wrong.</p><a href="/postmortem">Evidence, possible causes, and next experiments <ArrowRight size={14} aria-hidden="true"/></a></div></section>
    <div className="pf-analysis"><Attribution/><Calibration/></div>
    <section className="pf-validation"><div><h2>Out-of-sample validation</h2><p>The model improved on the forecast baseline for weather labels. It missed both geographic holdout thresholds and scored worse than the midpoint on market payouts.</p></div><a href="/methodology#validation">View model audit <ArrowRight size={14} aria-hidden="true"/></a></section>
  </div>;
}
