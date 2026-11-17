import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Postmortem",
  description: "Drawdowns, winner concentration, entry-week results and lessons from the DailyWeather cash-reconciled experiment.",
};

export default function PostmortemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
