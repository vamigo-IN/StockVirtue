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
    ];
  },
};

export default nextConfig;
