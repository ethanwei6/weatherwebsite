"use client";

import { useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import evidence from "../public/evidence.json";
import results from "../data/reconciled-results";
import "./trade-explorer.css";

type Trade = (typeof results.records)[number];
type ReviewedTrade = (typeof evidence.cases)[number];
type Scope = "reviewed" | "all" | "losses";

const pageSize = 8;
const trades = [...results.records].sort((a, b) => b.fillTime.localeCompare(a.fillTime));
const reviewed = new Map(evidence.cases.map(item => [item.id, item]));
const defaultTrade = evidence.cases.find(item => item.city.startsWith("Tokyo"))!.id;
const scopes = [
  { id: "reviewed", name: `Reviewed ${reviewed.size}` },
  { id: "all", name: `All ${trades.length}` },
  { id: "losses", name: "Losses" },
] as const;
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fullDate = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const percent = (value: number) => (value * 100).toFixed(2) + "%";
const price = (value: number) => "$" + value.toFixed(3);
const dollars = (value: number, digits = 2) => "$" + value.toFixed(digits);
const signedDollars = (value: number, digits = 2) => (value < 0 ? "−" : "+") + dollars(Math.abs(value), digits);
const cityName = (item: Trade) => item.city.split(",")[0];
const clock = (time: string | null) => time ? time.slice(0, 19).replace("T", " ") + " UTC" : "Unavailable in archive";
const shortTime = (time: string) => shortDate.format(new Date(time)) + ", " + time.slice(11, 16);
const bucketLabel = (item: Trade) => item.title.replace(/^Will the highest temperature in .+? be /, "").replace(/ on [A-Za-z]+ [0-9]+\?$/, "");

function matchingTrades(scope: Scope, query: string) {
  const term = query.trim().toLowerCase();
  return trades.filter(item => {
    if (scope === "reviewed" && !reviewed.has(item.id)) return false;
    if (scope === "losses" && item.outcome !== 0) return false;
    return [item.city, item.title, item.eventDate, item.id].join(" ").toLowerCase().includes(term);
  });
}

function QuoteHistory({ item }: { item: ReviewedTrade }) {
  const points = item.observations;
  const entryIndex = Math.max(0, points.findIndex(point => point.time === item.quoteTime));
  const [active, setActive] = useState(entryIndex);
  const point = points[active];
  const start = Date.parse(points[0].time);
  const end = Math.max(Date.parse(points[points.length - 1].time), Date.parse(item.fillTime));
  const position = (time: string) => ((Date.parse(time) - start) / (end - start)) * 100 + "%";
  return (
    <figure className="tx-history">
      <figcaption>
        <h3>Quotes around the fill</h3>
        <p>Each column is a recorded snapshot. Model probabilities use percent and prices use cents on the same 0–100 scale.</p>
      </figcaption>
      <div className="tx-key">
        <span><i className="tx-mark-model"/>Model P({item.side})</span>
        <span><i className="tx-mark-ask"/>Best ask</span>
        <span><i className="tx-mark-fill"/>Fill price</span>
      </div>
      <div className="tx-plot" role="group" aria-label="Recorded quote snapshots in chronological order">
        {[0, 25, 50, 75, 100].map(tick => (
          <div className="tx-plot-line" key={tick} style={{ bottom: tick + "%" }} aria-hidden="true">
            <span>{tick}</span>
          </div>
        ))}
        <div className="tx-fill-line" style={{ left: position(item.fillTime) }} aria-hidden="true">
          <span>Fill</span>
        </div>
        {points.map((observation, index) => (
          <button
            type="button"
            className="tx-observation"
            key={observation.sequence}
            style={{ left: position(observation.time) }}
            aria-label={clock(observation.time) + ", ask " + price(observation.ask) + ", model " +
              (observation.modelProbability === null ? "unavailable" : percent(observation.modelProbability))}
            aria-pressed={active === index}
            onFocus={() => setActive(index)}
            onMouseEnter={() => setActive(index)}
            onClick={() => setActive(index)}
          >
            <i className="tx-mark-ask" style={{ bottom: observation.ask * 100 + "%" }}/>
            {observation.modelProbability !== null && (
              <i className="tx-mark-model" style={{ bottom: observation.modelProbability * 100 + "%" }}/>
            )}
          </button>
        ))}
        <i
          className="tx-mark-fill tx-executed-point"
          style={{ left: position(item.fillTime), bottom: item.fillPrice * 100 + "%" }}
          aria-hidden="true"
        />
      </div>
      <div className="tx-plot-times">
        <time dateTime={points[0].time}>{shortTime(points[0].time)}</time>
        <time dateTime={points[points.length - 1].time}>{shortTime(points[points.length - 1].time)} UTC</time>
      </div>
      <div className="tx-readout" aria-live="polite">
        <time dateTime={point.time}>{shortTime(point.time)} UTC</time>
        <span>Model <b>{point.modelProbability === null ? "Unavailable" : percent(point.modelProbability)}</b></span>
        <span>Ask <b>{price(point.ask)}</b></span>
        <span>Bid <b>{price(point.bid)}</b></span>
      </div>
    </figure>
  );
}

function EntryComparison({ item }: { item: Trade }) {
  const values = [
    { label: "Model P(" + item.side + ")", value: item.modelProbability, displayed: percent(item.modelProbability), marker: "tx-mark-model" },
    { label: "Quoted ask", value: item.quotedAsk, displayed: price(item.quotedAsk), marker: "tx-mark-ask" },
    { label: "Confirmed fill", value: item.fillPrice, displayed: price(item.fillPrice), marker: "tx-mark-fill" },
  ];
  return (
    <figure className="tx-entry-comparison">
      <figcaption>
        <h3>Entry comparison</h3>
        <p>This position has one entry snapshot in the export. Each mark uses the same scale from zero to a full $1 payout.</p>
      </figcaption>
      {values.map(row => (
        <div className="tx-ruler" key={row.label}>
          <span>{row.label}</span>
          <div aria-hidden="true"><i className={row.marker} style={{ left: row.value * 100 + "%" }}/></div>
          <b>{row.displayed}</b>
        </div>
      ))}
    </figure>
  );
}

function TradeEvidence({ item, history }: { item: Trade; history: ReviewedTrade | undefined }) {
  const chain = [
    ["Signal", item.evidence.signalSequence],
    ["Order intent", item.evidence.intentSequence],
    ["Fill", item.evidence.fillSequence],
    ["Redemption", item.evidence.redemptionSequence],
    ["Reconciliation", item.evidence.settlementSequence],
  ] as const;
  return (
    <div className="tx-evidence">
      {history && (
        <details>
          <summary>{history.observations.length} recorded quote snapshots <ChevronDown size={16}/></summary>
          <div className="tx-table-scroll">
            <table>
              <thead><tr><th>Quote time (UTC)</th><th>Model P({item.side})</th><th>Ask</th><th>Bid</th><th>Record</th></tr></thead>
              <tbody>{history.observations.map(point => (
                <tr key={point.sequence}>
                  <td>{clock(point.time).replace(" UTC", "")}</td>
                  <td>{point.modelProbability === null ? "Unavailable" : percent(point.modelProbability)}</td>
                  <td>{price(point.ask)}</td><td>{price(point.bid)}</td><td>#{point.sequence}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </details>
      )}
      <details>
        <summary>Source records and payout calculation <ChevronDown size={16}/></summary>
        <div className="tx-source-records">
          <dl>
            <div><dt>Weather station</dt><dd>{item.station || "Unavailable in archive"}</dd></div>
            <div><dt>Forecast horizon</dt><dd>{item.leadDays} {item.leadDays === 1 ? "day" : "days"}</dd></div>
            {history && <div><dt>Forecast features recorded</dt><dd>{clock(history.featureTime)}</dd></div>}
            <div><dt>Quote snapshot</dt><dd>{clock(item.quoteTime)}</dd></div>
            <div><dt>Quote age at evaluation</dt><dd>{item.quoteAgeAtEvaluationSeconds.toFixed(6)} seconds</dd></div>
            <div><dt>Signal journaled</dt><dd>{clock(item.signalTime)}</dd></div>
            <div><dt>Fill confirmed</dt><dd>{clock(item.fillTime)}</dd></div>
            <div><dt>Cash reconciled</dt><dd>{clock(item.reconciliationTime)}</dd></div>
          </dl>
          <p>The freshness check uses quote age at evaluation. The signal can enter the journal later.</p>
          <p>Cash reconciliation records when the final payout was accounted for in the ledger.</p>
          <div className="tx-equation">
            {dollars(item.payoutUsd, 5)} − ({item.shares.toFixed(2)} × {price(item.fillPrice)}) − {dollars(item.feeUsd, 5)}
            {" = "}<strong>{signedDollars(item.pnlUsd, 5)}</strong>
          </div>
          <p>Position P&amp;L includes the recorded trading fee and excludes gas costs and taxes.</p>
          <ol className="tx-chain">{chain.map(([name, sequence]) => sequence == null ? null : (
            <li key={name}><span>{name}</span><b>#{sequence}</b></li>
          ))}</ol>
        </div>
      </details>
    </div>
  );
}

function PositionSheet({ item }: { item: Trade }) {
  const history = reviewed.get(item.id);
  const fillDifference = (item.fillPrice - item.quotedAsk) * 100;
  const fillComparison = Math.abs(fillDifference) < 0.000001
    ? "Matched the ask"
    : Math.abs(fillDifference).toFixed(2) + "¢ " + (fillDifference > 0 ? "above" : "below") + " ask";
  return (
    <article className="tx-sheet" aria-label="Selected trade">
      <header className="tx-sheet-heading">
        <p className="tx-sheet-meta">{cityName(item)} <span>·</span> {fullDate.format(new Date(item.eventDate))}</p>
        <h2>{item.title}</h2>
        <p><strong>Bought {item.side}.</strong> Each share would pay $1 if the daily high {item.side === "YES" ? "fell within" : "fell outside"} this temperature bucket.</p>
      </header>
      <div className="tx-stages">
        <section>
          <h3>Signal</h3>
          <strong className="tx-stage-number tx-edge">+{(item.grossEdge * 100).toFixed(2)} <small>pp</small></strong>
          <p className="tx-stage-caption">Model probability less ask</p>
          <dl>
            <div><dt>Model P({item.side})</dt><dd>{percent(item.modelProbability)}</dd></div>
            <div><dt>Quoted ask</dt><dd>{price(item.quotedAsk)}</dd></div>
          </dl>
          <time dateTime={item.signalTime}>Journaled {shortTime(item.signalTime)} UTC</time>
        </section>
        <section>
          <h3>Execution</h3>
          <strong className="tx-stage-number">{price(item.fillPrice)}</strong>
          <p className="tx-stage-caption">{fillComparison}</p>
          <dl>
            <div><dt>Shares bought</dt><dd>{item.shares.toFixed(2)}</dd></div>
            <div><dt>Trading fee</dt><dd>{dollars(item.feeUsd, 5)}</dd></div>
          </dl>
          <time dateTime={item.fillTime}>Filled {shortTime(item.fillTime)} UTC</time>
        </section>
        <section>
          <h3>Outcome</h3>
          <strong className={"tx-stage-number " + (item.pnlUsd >= 0 ? "tx-gain" : "tx-loss")}>{signedDollars(item.pnlUsd)}</strong>
          <p className="tx-stage-caption">Net position P&amp;L · {item.side} {item.outcome ? "won" : "lost"}</p>
          <dl>
            <div><dt>Cost incl. fee</dt><dd>{dollars(item.costUsd, 5)}</dd></div>
            <div><dt>Cash received</dt><dd>{dollars(item.cashReceivedUsd)}</dd></div>
          </dl>
          <time dateTime={item.reconciliationTime}>Reconciled {shortTime(item.reconciliationTime)} UTC</time>
        </section>
      </div>
      {history ? <QuoteHistory item={history}/> : <EntryComparison item={item}/>}
      <div className="tx-forecast">
        <h3>Forecast evidence</h3>
        <p>{item.leadDays}-day model estimate{item.station && <> at station <strong>{item.station}</strong></>}.
          {history ? " Forecast feeds in the signal record included " + history.sources.join(", ") + "." : " The linked signal record supplies the purchased-side probability."}
        </p>
      </div>
      <TradeEvidence item={item} history={history}/>
    </article>
  );
}

export default function TradeExplorer() {
  const params = useSearchParams();
  const requested = trades.find(item => item.id === params.get("trade"));
  const requestedScope = scopes.find(choice => choice.id === params.get("scope"))?.id;
  const inferredScope: Scope = !requested || reviewed.has(requested.id) ? "reviewed" : "all";
  const scope = requestedScope || inferredScope;
  const matches = matchingTrades(scope, "");
  const preferredId = requested?.id || (scope === "reviewed" ? defaultTrade : undefined);
  const first = matches.find(item => item.id === preferredId) || matches[0];
  return <TradeLedger key={`${scope}/${first?.id || ""}`} initialScope={scope} first={first?.id || null}/>;
}

function TradeLedger({ first, initialScope }: { first: string | null; initialScope: Scope }) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(first);
  const [page, setPage] = useState(() => Math.max(0, Math.floor(matchingTrades(initialScope, "").findIndex(item => item.id === first) / pageSize)));
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerButton = useRef<HTMLButtonElement>(null);
  const matches = matchingTrades(scope, query);
  const selected = matches.find(item => item.id === selectedId);
  const visible = matches.slice(page * pageSize, (page + 1) * pageSize);

  function filter(nextScope: Scope, nextQuery: string) {
    const list = matchingTrades(nextScope, nextQuery);
    const index = list.findIndex(item => item.id === selectedId);
    setScope(nextScope);
    setQuery(nextQuery);
    setSelectedId(index >= 0 ? selectedId : list[0]?.id || null);
    setPage(index >= 0 ? Math.floor(index / pageSize) : 0);
  }

  function choose(id: string) {
    setSelectedId(id);
    if (pickerOpen) {
      setPickerOpen(false);
      pickerButton.current?.focus({ preventScroll: true });
    }
  }

  function turnPage(next: number) {
    setPage(next);
    setSelectedId(matches[next * pageSize].id);
  }

  return (
    <section id="trades" className="tx-explorer" aria-label="Trade ledger">
      <aside className="tx-index">
        <button
          ref={pickerButton}
          type="button"
          className="tx-mobile-picker"
          aria-expanded={pickerOpen}
          aria-controls="tx-index-body"
          onClick={() => setPickerOpen(!pickerOpen)}
        >
          <span><b>Choose a trade</b>{selected && <small>{cityName(selected)} · {shortDate.format(new Date(selected.eventDate))} · Bought {selected.side}</small>}</span>
          <ChevronDown size={18}/>
        </button>
        <div id="tx-index-body" className={"tx-index-body " + (pickerOpen ? "tx-picker-open" : "")}>
          <div className="tx-index-heading"><h2>Trade index</h2><span>{matches.length} positions</span></div>
          <label className="tx-search">
            <Search size={16} aria-hidden="true"/>
            <input type="search" placeholder="City, market or date" aria-label="Search city, market or date" value={query} onChange={event => filter(scope, event.target.value)}/>
          </label>
          <div className="tx-filters" aria-label="Filter trade records">
            {scopes.map(choice => (
              <button key={choice.id} type="button" aria-pressed={scope === choice.id} onClick={() => filter(choice.id, query)}>
                {choice.name}
              </button>
            ))}
          </div>
          <div className="tx-ledger-head" aria-hidden="true"><span>Market / date</span><span>Side</span><span>Net P&amp;L</span></div>
          <div className="tx-rows" aria-label="Select a historical position">
            {visible.map(item => (
              <button
                type="button"
                key={item.id}
                aria-pressed={selectedId === item.id}
                aria-label={item.title + " Bought " + item.side + ", net position P&L " + signedDollars(item.pnlUsd, 5)}
                className="tx-ledger-row"
                onClick={() => choose(item.id)}
              >
                <span className="tx-index-market"><strong>{cityName(item)}</strong><small>{shortDate.format(new Date(item.eventDate))} · {bucketLabel(item)}</small></span>
                <span>{item.side}</span>
                <span className={item.pnlUsd >= 0 ? "tx-gain" : "tx-loss"}>{signedDollars(item.pnlUsd)}</span>
              </button>
            ))}
          </div>
          {!matches.length && (
            <div className="tx-empty"><p>No matching positions.</p><button type="button" onClick={() => filter("all", "")}>Clear filters</button></div>
          )}
          {matches.length > pageSize && (
            <div className="tx-pages">
              <button type="button" aria-label="Previous records" disabled={!page} onClick={() => turnPage(page - 1)}><ChevronLeft size={16}/></button>
              <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, matches.length)} of {matches.length}</span>
              <button type="button" aria-label="Next records" disabled={(page + 1) * pageSize >= matches.length} onClick={() => turnPage(page + 1)}><ChevronRight size={16}/></button>
            </div>
          )}
          <p className="tx-index-note">This ledger shows {trades.length} cash-reconciled positions from the archived journal. The 15 excluded positions lacked payout reconciliation at the cutoff and were later verified as resolved but unredeemed. This subset does not represent the whole portfolio. Reviewed cases include quote histories.</p>
        </div>
      </aside>
      {selected ? <PositionSheet item={selected} key={selected.id}/> : <p className="tx-no-selection">Choose a different search or filter to inspect a position.</p>}
    </section>
  );
}
