/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Supabase Storage
      { protocol: 'https', hostname: '*.supabase.co' },
      // Cloudflare Stream thumbnails
      { protocol: 'https', hostname: 'customer-*.cloudflarestream.com' },
      { protocol: 'https', hostname: 'videodelivery.net' },
      // Demo-media curated stock (NEXT_PUBLIC_DEMO_MEDIA=true only). Free
      // commercial-use Unsplash + Pexels CDNs. Production keeps the flag off
      // so real listings show real photos; this allow-list is harmless when
      // the flag is unset because nothing requests these hosts.
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'images.pexels.com' },
      { protocol: 'https', hostname: 'videos.pexels.com' },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
