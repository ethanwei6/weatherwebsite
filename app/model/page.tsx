import type { Metadata } from "next";
import ModelLab from "../../components/model-lab";

const description = "Follow the Tokyo 30°C market from weather forecasts and empirical residuals to a quoted ask, a confirmed five-share NO fill, and its reconciled payout.";

export const metadata: Metadata = {
  title: "Model & Trader",
  description,
};

export default function ModelPage() {
  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Model &amp; Trader</h1>
          <p>Trace the weather estimate, independent market quote and cash flows of one historical S01 position.</p>
        </div>
      </header>
      <ModelLab />
    </>
  );
}
