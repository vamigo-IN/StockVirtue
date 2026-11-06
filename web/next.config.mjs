/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // We hand-author clean markup; don't let a missing eslint config fail prod builds.
  eslint: { ignoreDuringBuilds: true },
  // The old single-page admin's bookmark; its settings now live here.
  async redirects() {
    return [
      {
        source: '/admin/dashboard',
        destination: '/admin/settings',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // The logo and icon every StockVirtue email loads (backend MailService).
        source: '/email/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
      {
        // The public site's static display faces (public/fonts). A changed
        // file gets a new version suffix (.v2), never the same name.
        source: '/fonts/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

// `ANALYZE=true npm run build` writes bundle reports to <distDir>/analyze.
// The analyser is a dev dependency, so it is only imported when asked for:
// `next start` on a server installed without dev dependencies never needs it.
const withAnalyzer =
  process.env.ANALYZE === 'true'
    ? (await import('@next/bundle-analyzer')).default({ enabled: true })
    : (config) => config;

// NEXT_DIST_DIR lets the shared dev server build into .next-dev while
// `next build` keeps the default .next, so the two never collide.
export default withAnalyzer({
  ...nextConfig,
  distDir: process.env.NEXT_DIST_DIR || '.next',
});
