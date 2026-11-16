import { Suspense } from "react";
import type { Metadata } from "next";
import TradeExplorer from "../../components/trade-explorer";

export const metadata: Metadata = {
  title: "Trade ledger",
  description: "Explore 242 cash-reconciled historical weather-market positions from model signal through confirmed fill and recorded payout.",
};

export default function TradesPage() {
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Trade ledger</h1>
          <p>Follow 242 cash-reconciled July–August 2026 positions from the model’s signal to the fill and recorded payout.</p>
        </div>
      </header>
      <Suspense fallback={<p>Loading the trade ledger…</p>}><TradeExplorer/></Suspense>
    </>
  );
}
