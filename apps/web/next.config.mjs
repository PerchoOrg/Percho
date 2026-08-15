/** @type {import('next').NextConfig} */
// Load the repo-root .env.local (Supabase CLI creds + OPENROUTER_API_KEY live
// there; Next only auto-loads apps/web/.env.local). dotenv is a Next
// dependency — no new package needed.
import { config as loadEnv } from 'dotenv';
loadEnv({ path: new URL('../../.env.local', import.meta.url).pathname });

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
