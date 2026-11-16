import type { Metadata } from "next";
import SiteShell from "../components/site-shell";
import "./globals.css";

const description = "Ethan Wei’s weather prediction market research, from forecast errors and executable signals to historical fills, validation and cash-reconciled performance.";
const title = "DailyWeather — Weather market research";

const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;

export const metadata: Metadata = {
  metadataBase: new URL(deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000"),
  title: { default: "Performance · DailyWeather", template: "%s · DailyWeather" },
  description,
  authors: [{ name: "Ethan Wei" }],
  icons: { icon: "/favicon.svg" },
  openGraph: {
    type: "website",
    title,
    description,
    siteName: "DailyWeather",
    images: [{ url: "/research-preview.png", width: 1200, height: 630, alt: "DailyWeather cash-reconciled cohort: 242 positions, closing P&L +$4.27 and peak P&L +$36.19" }],
  },
  twitter: { card: "summary_large_image", title, description, images: ["/research-preview.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><SiteShell>{children}</SiteShell></body></html>;
}
