import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'Download',
  description: `Download ${SITE.name} free on Google Play and start practising the Indian stock market with virtual money.`,
  alternates: { canonical: '/download' },
};

export default function DownloadPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <h1>Download {SITE.name}</h1>
          <p className="lead">
            Free on Android. Start trading the markets with virtual money in
            minutes — no deposits, no risk.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container center">
          <a
            className="btn btn-primary btn-lg"
            href={SITE.playUrl}
            target="_blank"
            rel="noopener"
            style={{ fontSize: '1.1rem' }}
          >
            <Icon name="play" size={20} />
            Get it on Google Play
          </a>
          <p className="muted" style={{ marginTop: 16 }}>
            Package:&nbsp;<code>{SITE.packageId}</code>
          </p>

          <div
            className="grid grid-3"
            style={{ marginTop: 48, textAlign: 'left' }}
          >
            <div className="card">
              <div className="icon">
                <Icon name="shield" />
              </div>
              <h3>100% virtual money</h3>
              <p>You never deposit or withdraw real funds. Practise freely.</p>
            </div>
            <div className="card">
              <div className="icon">
                <Icon name="chart" />
              </div>
              <h3>Real market data</h3>
              <p>Live NSE &amp; BSE prices so your practice mirrors reality.</p>
            </div>
            <div className="card">
              <div className="icon">
                <Icon name="trophy" />
              </div>
              <h3>Free forever</h3>
              <p>Download and trade at no cost. Learning shouldn&apos;t be paywalled.</p>
            </div>
          </div>

          <p className="muted" style={{ marginTop: 40, fontSize: '0.9rem' }}>
            iOS support is planned. Want to be notified?{' '}
            <a href="/contact" style={{ color: 'var(--green)', fontWeight: 600 }}>
              Get in touch
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
