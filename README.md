# DailyWeather

A technical portfolio for weather prediction-market research. Four pages present cash-reconciled performance, a model-to-trade flow diagram, individual trade evidence, and the mathematical specification and validation results.

This repository is a standalone Next.js application. It runs without API keys, a database, a wallet connection, or the Sites hosting service.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). For the production build:

```sh
npm run build
npm start
```

Run `npm run typecheck` to check TypeScript.

## Deploy on Vercel

1. In Vercel, choose **Add New → Project** and import **ethanwei6/weatherwebsite**.
2. Use the **Next.js** framework preset and repository root **./**.
3. Keep the defaults: `npm run build`, the default Next.js output directory, and `npm install` or `npm ci` for installation.
4. Use Node.js **24.x**. No environment variables or credentials need to be added.
5. Deploy. Vercel's Git integration can deploy future pushes to `main` automatically.

Social-preview URLs use Vercel's supplied deployment hostname. Local development falls back to localhost. No fixed Sites URL or hosting credentials are included.

These settings follow [Vercel's Next.js deployment documentation](https://vercel.com/docs/frameworks/full-stack/nextjs) and [Git integration](https://vercel.com/docs/git).

## Historical data and scope

The figures are historical records, not a live account balance or a simulation.

- The displayed chart, attribution, calibration, and trade ledger include **242 cash-reconciled positions**. Original recorded fill fees are included. Closing cumulative P&L is **+$4.26556**. Peak cumulative P&L after a cash reconciliation is **+$36.19235**, reached August 10, 2026 at 06:03 UTC.
- **15 additional positions without archived cash reconciliation are excluded from that display**. The complete downloadable `public/results.json` retains all **257** historical positions and their settlement-value accounting. Methodology explains the distinction and the later verification snapshot.
- `public/evidence.json` contains six selected historical trade examples and sparse quote observations. These illustrate the process and are not a representative performance sample.
- `public/model-evaluation.json` contains the historical model-family validation. Forecast evaluation, market-payout evaluation, and executed-trade results use different populations.
- Gas, taxes, and costs absent from the original trading-fee records are excluded. The displayed figures are a selected position cohort, not whole-account returns.

The repository contains the sanitized data displayed by the website. Raw ledgers, private operating files, wallet addresses, order/token/transaction identifiers, signing keys, environment files, and trading integrations are excluded. Source digests and journal sequence references remain as provenance.

## Source layout

- `app/` — Performance, Model & Trader, Trades, and Methodology routes and styles.
- `components/` — Navigation, model diagram and calculator, trade explorer, and equations.
- `data/reconciled-results.ts` — Shared derivation of the displayed 242-position subset and reconciliation timeline.
- `public/` — Downloadable historical data, favicon, and social preview image.

The separate [MultiagentWeather research repository](https://github.com/ethanwei6/MultiagentWeather) contains the public research package. This repository contains the website only and has no order-placement or redemption capability.
