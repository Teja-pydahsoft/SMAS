/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: import.meta.dirname,
  env: {
    // Expose the backend URL to the browser so <img> tags can load photos
    // directly from the backend (bypassing the Next.js rewrite proxy).
    NEXT_PUBLIC_BACKEND_URL: process.env.BACKEND_URL || '',
  },
  async rewrites() {
    const backend = process.env.BACKEND_URL || 'http://localhost:3001';
    return [
      { source: '/api/:path*', destination: `${backend}/api/:path*` },
      { source: '/uploads/:path*', destination: `${backend}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
