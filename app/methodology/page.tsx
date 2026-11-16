"use client";

import { useSyncExternalStore } from "react";
import { ArrowDownToLine, ArrowUpRight } from "lucide-react";
import ModelSpec from "../../components/model-spec";
import evaluation from "../../public/model-evaluation.json";
import results from "../../data/reconciled-results";
import "./methodology.css";

const topics = [
  { id: "validation", label: "Validation" },
  { id: "specification", label: "Mathematical specification" },
  { id: "evidence", label: "Evidence & downloads" },
] as const;
const subscribeToTopic = (notify: () => void) => {
  window.addEventListener("hashchange", notify);
  return () => window.removeEventListener("hashchange", notify);
};
const readTopic = () => topics.find(topic => `#${topic.id}` === window.location.hash)?.id ?? "validation";
const defaultTopic = () => "validation" as const;
const fixed = (number: number) => number.toFixed(5);
const count = (number: number) => number.toLocaleString("en-US");
const { weatherEvaluation: weather, marketDiagnostic: market, gates } = evaluation;
const { cohort, metrics, payoutCoverage } = results;
const { cashReconciled, resolvedUnredeemed } = payoutCoverage;
const usdExact = (value: number) => `${value < 0 ? "−" : ""}$${fixed(Math.abs(value))}`;
const signedUsd = (value: number) => `${value >= 0 ? "+" : ""}${usdExact(value)}`;
const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
});
const coverageDate = dateFormat.format(new Date(payoutCoverage.verifiedAt));
const closingDay = results.dailyRealizedPnl[results.dailyRealizedPnl.length - 1];
const peakReconciliation = results.reconciliationPnl.reduce((peak, event) => event.cumulativePnlUsd > peak.cumulativePnlUsd ? event : peak);
const scoreGroups = [
  { target: "Observed weather", rows: weather.rows, scores: [
    { model: "Forecast baseline", brier: weather.baseline.brier, loss: weather.baseline.logLoss },
    { model: "Selected model family", brier: weather.candidate.brier, loss: weather.candidate.logLoss },
  ] },
  { target: "Market payout", rows: market.rows, scores: [
    { model: "Forecast baseline", brier: market.baseline.brier, loss: market.baseline.log_loss },
    { model: "Selected model family", brier: market.candidate.brier, loss: market.candidate.log_loss },
    { model: "Market midpoint", brier: market.marketMidpoint.brier, loss: market.marketMidpoint.log_loss },
  ] },
];
const downloads = [
  { label: "Full execution archive", description: `${cohort.nonCanaryBuyRecords} positions, including ${resolvedUnredeemed.count} excluded from the displayed cash cohort`, file: "results.json" },
  { label: "Model evaluation", description: "Scores, splits, holdouts and audit limits", file: "model-evaluation.json" },
  { label: "Trade case histories", description: "Six selected trades and their recorded quote snapshots", file: "evidence.json" },
];

function Validation() {
  const bootstrap = weather.cityDateClusterBootstrap;
  return <section aria-label="Validation" className="md-content">
    <div className="md-layout">
      <section className="md-ruled">
        <div className="md-section-head"><h2>Out-of-sample scores</h2><span>Jan–Jun 2026</span></div>
        <p className="md-text">The selected family improved both scores on observed weather. On resolved market payouts, the market midpoint scored best. Lower scores are better within each target.</p>
        <div className="md-scroll"><table className="data-table md-score-table">
          <thead><tr><th scope="col">Model</th><th scope="col">Brier</th><th scope="col">Log loss</th></tr></thead>
          {scoreGroups.map(group => <tbody key={group.target}>
            <tr className="md-group-title"><th scope="rowgroup" colSpan={3}>{group.target} <span>· {count(group.rows)} rows</span></th></tr>
            {group.scores.map(score => <tr key={score.model}><th scope="row">{score.model}</th><td>{fixed(score.brier)}</td><td>{fixed(score.loss)}</td></tr>)}
          </tbody>)}
        </table></div>
        <p className="md-small">Rows repeat forecasts, buckets, decision times, and quote sides. The targets use different populations.</p>
      </section>
      <aside className="md-ruled md-aside">
        <h2>Geographic holdouts</h2>
        <p className="md-text">A group passes when the candidate improves both Brier score and log loss over the forecast baseline. Each test requires a 70% pass rate.</p>
        <dl className="md-gates">{[{ name: "Cities", gate: gates.cityHoldout }, { name: "Regions", gate: gates.regionHoldout }].map(({ name, gate }) => <div key={name}>
          <dt>{name}</dt><dd><strong>{gate.passed} / {gate.total}</strong><span>{(gate.passRate * 100).toFixed(1)}% · Failed</span></dd>
        </div>)}</dl>
        <p className="md-small">The city and region holdouts reuse historical data. Their observations overlap the temporal evaluation.</p>
      </aside>
    </div>
    <section className="md-estimate"><h2>Uncertainty in the weather scores</h2>
      <p className="md-text">Baseline minus candidate Brier score was <strong>{fixed(weather.improvement.brier)}</strong>. Resampling {count(bootstrap.clusters)} city–date clusters {bootstrap.iterations} times gave a 95% interval of <strong>[{bootstrap.brierImprovementInterval.map(fixed).join(", ")}]</strong>.</p>
    </section>
    <div className="md-disclosures">
      <details><summary>Model selection, metrics and temporal splits</summary><div className="md-detail-body">
        <p>Each outer test month used a configuration selected on an earlier inner validation month. The primary estimates use a zero-day embargo. Separate checks used 3- and 7-day embargoes.</p>
        <div className="md-formulas"><span>BS = N⁻¹ Σᵢ (pᵢ − yᵢ)²</span><span>LL = −N⁻¹ Σᵢ [yᵢ log pᵢ + (1 − yᵢ) log(1 − pᵢ)]</span></div>
        <div className="md-scroll"><table className="data-table"><thead><tr><th scope="col">Test month</th><th scope="col">Train rows</th><th scope="col">Inner validation</th><th scope="col">Test rows</th></tr></thead><tbody>{evaluation.outerSplits.filter(split => split.embargo_days === 0).map(split =>
          <tr key={split.target_month}><th scope="row">{split.target_month}</th><td>{count(split.train_n)}</td><td>{count(split.inner_valid_n)}</td><td>{count(split.test_n)}</td></tr>)}
        </tbody></table></div>
        <p>The archived audit recorded zero train/test city–date overlap and zero unavailable-label rows under its purge rules. Raw-input availability remains an independent verification question.</p>
      </div></details>
      <details><summary>Scope and limitations</summary><div className="md-detail-body"><ul>{evaluation.limitations.map(limitation => <li key={limitation}>{limitation}</li>)}</ul></div></details>
    </div>
    <p className="md-small md-archive-note">The July 7, 2026 report evaluates historical model-family selection. It contains no fixed-S01 P&L backtest. The observed-high adjustment chiefly helps same-day forecasts, while S01 enters one or two days ahead.</p>
  </section>;
}

function Evidence() {
  const source = evaluation.publicMethodSource;
  return <section aria-label="Evidence and downloads" className="md-content">
    <div className="md-layout">
      <section className="md-ruled">
        <h2>Cash-reconciled cohort</h2>
        <p className="md-text">The displayed performance, calibration and trade ledger cover <strong>{metrics.count} of {cohort.nonCanaryBuyRecords} non-canary BUY positions</strong>. Each has a confirmed fill linked to token redemption and cash reconciliation. Recorded proceeds total {usdExact(cashReconciled.payoutUsd)}.</p>
        <p className="md-text">The {resolvedUnredeemed.count} other positions have known settlement outcomes and were unredeemed at the verification snapshot. They are excluded from the displayed cash cohort. The full execution archive below retains their outcomes and settlement values.</p>
        <h3>Closing and peak P&amp;L</h3>
        <p className="md-text">Closing cumulative P&amp;L is <strong>{signedUsd(closingDay.cumulativePnlUsd)}</strong> on {dateFormat.format(new Date(closingDay.date))}. The peak after cash reconciliation is <strong>{signedUsd(peakReconciliation.cumulativePnlUsd)}</strong> on {dateFormat.format(new Date(peakReconciliation.date))}, at {peakReconciliation.date.slice(11).replace(/Z$/, "")} UTC, after {peakReconciliation.cumulativePositionCount} positions.</p>
        <p className="md-small">The cumulative chart advances through {results.reconciliationPnl.length} cash-reconciliation events. Daily bars combine those changes into {results.dailyRealizedPnl.length} UTC dates. Both use the cash-reconciled subset and originally recorded fill fees. The peak excludes unrealized market-price changes between reconciliations.</p>
        <h3>Source provenance</h3>
        <p className="md-text">The execution journal ends on August 18, 2026. A separate payout check for the excluded holdings is dated {coverageDate}. One technical-canary BUY/SELL round trip is excluded from both cohorts.</p>
        <dl className="md-hash"><dt>Ledger SHA-256</dt><dd>{results.source.sha256}</dd></dl>
        <a className="md-link" href={`${source.repository}/blob/${source.localPublicReleaseCommit}/${source.file}`} target="_blank" rel="noreferrer">Pinned model implementation <ArrowUpRight size={14} aria-hidden="true"/></a>
      </section>
      <aside className="md-ruled md-aside"><h2>Position accounting</h2>
        <p className="md-equation">P&amp;L = cash received − (shares × fill price) − recorded fee</p>
        <dl className="md-ledger">{[
          ["Cash received", usdExact(cashReconciled.payoutUsd)],
          ["Entry cost including fill fees", usdExact(metrics.entryCostUsd)],
          ["Cash-reconciled positions", metrics.count],
          ["Closing cumulative P&L", signedUsd(metrics.netPnlUsd)],
        ].map(([label, amount]) => <div key={label}><dt>{label}</dt><dd>{amount}</dd></div>)}</dl>
        <p className="md-small">The cost basis uses the originally recorded trading fees. Gas and taxes are excluded. Entry cost measures cumulative turnover, and the cash P&amp;L series starts at zero.</p>
      </aside>
    </div>
    <section className="md-downloads"><h2>Download the source data</h2>{downloads.map(item => <a href={`/${item.file}`} key={item.file} download><strong>{item.label}</strong><span>{item.description}</span><code>{item.file}</code><ArrowDownToLine size={16} aria-hidden="true"/></a>)}</section>
    <div className="md-disclosures">
      <details><summary>Full-archive audit and excluded positions</summary><div className="md-detail-body">
        <p>The results.json download contains all {cohort.nonCanaryBuyRecords} non-canary purchases. Its aggregate settlement-value metrics include the {resolvedUnredeemed.count} holdings excluded from the displayed cash cohort.</p>
        <p>At {coverageDate}, {resolvedUnredeemed.winningPositions} of those holdings entitled the wallet to {resolvedUnredeemed.payoutUsd.toFixed(2)} pUSD, and {resolvedUnredeemed.losingPositions} had a final payout of zero. Their recorded entry cost was {usdExact(resolvedUnredeemed.entryCostUsd)}, giving settlement-value P&amp;L of {signedUsd(resolvedUnredeemed.netPnlUsd)}. Combined with the cash-reconciled positions, full-archive P&amp;L at settlement value was {signedUsd(cashReconciled.netPnlUsd + resolvedUnredeemed.netPnlUsd)}.</p>
        <p>The holdings matched the archived fills by token, condition, purchased side and quantity. Polygon contract reads confirmed held shares and payout fractions at <a href={`https://polygonscan.com/block/${payoutCoverage.polygonBlock}`} target="_blank" rel="noreferrer">block {payoutCoverage.polygonBlock.toLocaleString("en-US")}</a>.</p>
        <p>Later journal entries reduced entry costs for two non-canary positions by {usdExact(Math.abs(payoutCoverage.nonCanaryCostCorrectionUsd))}. Including these credits gives {usdExact(payoutCoverage.adjustedNetPnlUsd)} across all {cohort.nonCanaryBuyRecords} purchases. The displayed cash cohort retains the original fill-fee basis.</p>
      </div></details>
      <details><summary>Execution evidence limitations</summary><div className="md-detail-body">
        <p>The cash-cohort figures describe selected, executed and reconciled positions. Positions can share city–date events, and small group sizes limit comparisons. Their totals cover only this subset of the full archive.</p>
        <p>{results.methodology.signalTimestampSemantics}</p>
        <p>The six trade histories are deliberately selected examples. Their charts show recorded quote snapshots. Their payouts have cash-reconciliation evidence. The full download includes additional methodology and limitations for its settlement-value series.</p>
      </div></details>
    </div>
  </section>;
}

export default function MethodologyPage() {
  const topic = useSyncExternalStore(subscribeToTopic, readTopic, defaultTopic);
  const content = { validation: <Validation/>, specification: <ModelSpec/>, evidence: <Evidence/> };
  return <div className="md-page">
    <header className="page-heading"><div><h1>Methodology</h1><p>Forecast validation, the frozen S01 specification, and source records for the execution results.</p></div></header>
    <nav className="md-tabs" aria-label="Methodology topics">{topics.map(item => <a key={item.id} href={`#${item.id}`} aria-current={topic === item.id ? "page" : undefined}>{item.label}</a>)}</nav>
    {content[topic]}
  </div>;
}
