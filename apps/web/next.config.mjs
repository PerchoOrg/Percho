/** @type {import('next').NextConfig} */
// Load the repo-root .env.local (Supabase CLI creds + OPENROUTER_API_KEY live
// there; Next only auto-loads apps/web/.env.local). Vercel has its own env
// config, so skip loading there — also avoids needing dotenv in the build.
import { existsSync } from 'node:fs';
if (!process.env.VERCEL) {
  const envPath = new URL('../../.env.local', import.meta.url).pathname;
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Supabase Storage
      { protocol: 'https', hostname: '*.supabase.co' },
      // Cloudflare Stream thumbnails
      { protocol: 'https', hostname: 'customer-*.cloudflarestream.com' },
      { protocol: 'https', hostname: 'videodelivery.net' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
