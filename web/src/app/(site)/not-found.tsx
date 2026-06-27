import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="section">
      <div className="container center" style={{ padding: '80px 20px' }}>
        <div
          style={{ fontSize: '5rem', fontWeight: 900, color: 'var(--green)' }}
        >
          404
        </div>
        <h1>Page not found</h1>
        <p className="lead">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
        <div style={{ marginTop: 24 }}>
          <Link className="btn btn-primary" href="/">
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}
