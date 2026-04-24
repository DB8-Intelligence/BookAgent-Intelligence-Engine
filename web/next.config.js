/**
 * Next.js config — unified server (Cloud Run).
 *
 * Backend Express serve o Next.js via custom server no mesmo processo e
 * mesma porta (ver src/index.ts → bootstrapNext). Todas as chamadas a
 * /api/v1/* são same-origin, então rewrites de API foram removidos.
 *
 * Em desenvolvimento (cd web && npm run dev), o Next roda em :3001 e precisa
 * proxy-ar /api/v1/* pra o backend Express em :3000 — use NEXT_PUBLIC_API_URL
 * no web/.env.local se quiser apontar pra backend remoto.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Em prod o backend Express serve /api/v1/* no mesmo host → sem rewrite.
    if (process.env.NODE_ENV === 'production') return [];
    return [
      {
        source: '/api/v1/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'}/api/v1/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
