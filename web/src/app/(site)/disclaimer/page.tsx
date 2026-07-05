import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { LegalShell } from '@/components/motion/LegalShell';

export const metadata: Metadata = {
  title: 'Risk Disclaimer',
  description: `${SITE.name} is an educational simulator using virtual money. It is not investment advice and not a broker.`,
  alternates: { canonical: '/disclaimer' },
};

const UPDATED = 'June 27, 2026';

export default function DisclaimerPage() {
  return (
    <LegalShell
      title="Risk Disclaimer"
      updated={UPDATED}
      summary={`${SITE.name} is an educational simulator using virtual money — not investment advice, and not a broker.`}
    >
      <h2>Educational simulator — virtual money only</h2>
          <p>
            {SITE.name} is a <strong>stock-market simulator built for
            education</strong>. All trading inside the Service is performed with{' '}
            <strong>virtual money</strong>. No real securities are traded, and no
            real funds are ever deposited, held, or withdrawn. Simulated balances,
            profits, and losses have <strong>no monetary value</strong>.
          </p>

          <h2>Not investment advice</h2>
          <p>
            Nothing in {SITE.name} — including prices, charts, tools, lessons,
            quizzes, leaderboards, or any output — is investment, financial,
            legal, or tax advice, or a recommendation to buy, sell, or hold any
            security. Content is for general education and illustration only.
          </p>

          <h2>Not a broker or adviser</h2>
          <p>
            {SITE.company} is not a stock broker, exchange, depository
            participant, research analyst, or investment adviser, and is not
            registered with SEBI or any other regulator. {SITE.name} does not
            facilitate real securities transactions.
          </p>

          <h2>Markets carry real risk</h2>
          <p>
            Investing and trading in real securities involves substantial risk,
            including the possible loss of your entire capital. Past performance —
            real or simulated — is not indicative of future results. Simulated
            results have inherent limitations and may not reflect real-market
            conditions such as slippage, liquidity, latency, and order rejection.
          </p>

          <h2>Do your own research</h2>
          <p>
            Before making any real investment, conduct your own due diligence and
            consult a <strong>SEBI-registered investment adviser</strong>. You are
            solely responsible for your real-world financial decisions.
          </p>

          <h2>Data accuracy</h2>
          <p>
            Market data is sourced from third parties and may be delayed,
            incomplete, or inaccurate. We make no warranty as to its accuracy or
            availability.
          </p>

      <p style={{ marginTop: 28 }}>
        By using {SITE.name}, you acknowledge and accept this disclaimer
        together with our <a href="/terms">Terms &amp; Conditions</a> and{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>
    </LegalShell>
  );
}
