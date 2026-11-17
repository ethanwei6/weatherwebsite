"use client";

import { usePathname } from "next/navigation";

const pages = [
  { href: "/", label: "Performance" },
  { href: "/postmortem", label: "Postmortem" },
  { href: "/model", label: "Model & Trader" },
  { href: "/trades", label: "Trades" },
  { href: "/methodology", label: "Methodology" },
];

export default function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="masthead">
          <a className="brand" href="/" aria-label="DailyWeather home">Daily<span>Weather</span></a>
          <nav className="primary-nav" aria-label="Main navigation">
            {pages.map(({ href, label }) => (
              <a key={href} href={href} aria-current={pathname === href ? "page" : undefined}>{label}</a>
            ))}
          </nav>
          <a className="source-link" href="https://github.com/ethanwei6/weatherwebsite" target="_blank" rel="noreferrer">
            Source code <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>
      <main className="site-main" id="main">{children}</main>
      <footer className="site-footer">
        <span>DailyWeather <span aria-hidden="true">/</span> Ethan Wei</span>
        <span>Cash-reconciled cohort · July–August 2026</span>
        <a href="/methodology">Methods and data <span aria-hidden="true">↗</span></a>
      </footer>
    </>
  );
}
