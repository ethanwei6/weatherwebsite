import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Postmortem",
  description: "Drawdowns, profit concentration, chronological comparisons and uncertainty in the DailyWeather trading experiment.",
};

export default function PostmortemLayout({ children }: { children: React.ReactNode }) {
  return children;
}
