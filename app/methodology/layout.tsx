import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Methodology",
  description: "Validation scores, model equations, cohort definitions and the archived evidence used in the DailyWeather results.",
};

export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
