# Crypto King Portfolio Tracker

A Next.js application for tracking and managing cryptocurrency trades across multiple exchanges with real-time price updates and performance analytics.

## Features

- **Trade Management**
  - Add and track crypto trades across different exchanges
  - Support for spot and perpetual futures markets
  - Partial sell functionality with trade history
  - Import trades from Excel files

- **Real-time Price Updates**
  - Integration with multiple exchange APIs (Bybit, KuCoin, Coinex, Coinbase, MEXC)
  - Price sparklines for visual trend analysis
  - Automatic price refresh functionality

- **Performance Analytics**
  - Portfolio overview with total value and P&L calculations
  - Win rate and trade performance metrics
  - Interactive charts for:
    - Closed trades performance
    - Open positions tracking
    - Monthly performance analysis
    - Win rate over time
    - Hold time vs. profit analysis

- **Data Storage**
  - Supabase integration for secure data persistence
  - Historical price tracking
  - Trade history with detailed metrics

## Tech Stack

- **Frontend**: Next.js 15.1.0 with TypeScript
- **UI Components**: 
  - Tailwind CSS for styling
  - Radix UI for accessible components
  - Recharts for data visualization
- **Backend**: 
  - Next.js API routes
  - Supabase for database
- **APIs**: Multiple cryptocurrency exchange integrations

## Getting Started

1. Clone the repository
2. Install dependencies:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
