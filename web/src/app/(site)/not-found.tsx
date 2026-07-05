import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="hero terminal" style={{ minHeight: '70vh', display: 'grid', alignItems: 'center' }}>
      <div className="floor" aria-hidden="true" />
      <div className="grid-bg" aria-hidden="true" />
      <div
        className="container center"
        style={{ position: 'relative', zIndex: 2, padding: '60px 20px' }}
      >
        <div
          className="mono accent"
          style={{ fontSize: 'clamp(4rem, 16vw, 9rem)', fontWeight: 700, lineHeight: 1 }}
        >
          404
        </div>
        <h1 style={{ marginTop: 8 }}>Order not found</h1>
        <p className="hero-sub" style={{ margin: '0 auto 26px' }}>
          This page doesn&apos;t exist or has moved. Let&apos;s get you back to
          the trading desk.
        </p>
        <Link className="btn btn-primary btn-lg" href="/">
          Back to home
        </Link>
      </div>
    </section>
  );
}
