/**
 * OG image for `/s/[agentSlug]/[listingSlug]` — 1200×630, single shared
 * across all 4 styles for v1 simplicity.
 *
 * Edge runtime per next/og guidance. Cover photo background with a
 * dark→light gradient scrim so address + price read on any photo.
 */

import { thumbnailUrl } from '@/lib/cloudflare/stream';
import { demoCoverFor } from '@/lib/demo-media';
import { loadListingFeedBySlug } from '@/lib/listing-feed/load';
import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Vicinity listing';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const FALLBACK =
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1600&q=80';

export default async function OpengraphImage({
  params,
}: {
  params: { agentSlug: string; listingSlug: string };
}) {
  const bundle = await loadListingFeedBySlug(params.agentSlug, params.listingSlug);

  let title = 'Vicinity';
  let location = '';
  let price = '';
  let specs = '';
  let bg = FALLBACK;

  if (bundle) {
    const { listing, listingVideos } = bundle;
    title = listing.address;
    location = `${listing.city}, ${listing.state}`;
    price = listing.price ? `$${listing.price.toLocaleString()}` : '';
    specs = [
      listing.beds != null ? `${listing.beds} bd` : null,
      listing.baths != null ? `${listing.baths} ba` : null,
      listing.sqft != null ? `${listing.sqft.toLocaleString()} sqft` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    let real: string | null = listing.cover_url ?? null;
    if (!real && listingVideos[0]) {
      try {
        real = thumbnailUrl(listingVideos[0].cf_video_id);
      } catch {
        real = null;
      }
    }
    bg = demoCoverFor(listing.id, real) ?? FALLBACK;
  }

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        backgroundColor: '#f3eee7',
      }}
    >
      {/* biome-ignore lint/nursery/noImgElement: ImageResponse renders to PNG */}
      <img
        src={bg}
        alt=""
        width={1200}
        height={630}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.65) 100%)',
        }}
      />
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 64px',
          width: '100%',
          color: '#fbf8f3',
          fontFamily: 'serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            opacity: 0.9,
          }}
        >
          {location || 'VICINITY'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 78,
              lineHeight: 1.05,
              fontWeight: 500,
              maxWidth: 980,
            }}
          >
            {title}
          </div>
          {price ? (
            <div
              style={{
                display: 'flex',
                marginTop: 18,
                fontSize: 44,
                opacity: 0.95,
              }}
            >
              {price}
            </div>
          ) : null}
          {specs ? (
            <div
              style={{
                display: 'flex',
                marginTop: 8,
                fontSize: 26,
                opacity: 0.9,
              }}
            >
              {specs}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              marginTop: 28,
              fontSize: 22,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              opacity: 0.85,
            }}
          >
            Vicinity
          </div>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
