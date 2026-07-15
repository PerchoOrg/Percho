'use client';

/**
 * CommunityBoundaryMap — MapLibre GL + Carto Positron basemap that renders
 * a single community's polygon on top of a light street map.
 *
 * Phase 87 (2026-07-15). Why MapLibre + Carto:
 *   - No vendor token, no per-load quota, no bill.
 *   - Positron style is neutral gray so the orange boundary reads at a
 *     glance without competing for attention.
 *   - Bundle is ~200KB gzipped, lazy-loaded on the client component
 *     so /c/[slug] SSR isn't blocked on it.
 *
 * The `boundary` prop is a GeoJSON (Multi)Polygon exactly as stored in
 * communities.boundary. We compute its bbox client-side and fitBounds
 * so the map lands zoomed on the neighborhood without a magic zoom level.
 */

import { useEffect, useRef } from 'react';
import type { GeoJsonPolygonLike } from '@/lib/geo/point-in-polygon';
import { bboxOf } from '@/lib/geo/point-in-polygon';

// MapLibre CSS is loaded via the sibling <link> we inject on mount so we
// don't force the whole app to import the stylesheet.
const MAPLIBRE_CSS_HREF = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
const CARTO_POSITRON =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export function CommunityBoundaryMap({
  boundary,
  className,
}: {
  boundary: GeoJsonPolygonLike;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import('maplibre-gl').Map | null = null;
    let cancelled = false;

    // Inject CSS once.
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS_HREF}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = MAPLIBRE_CSS_HREF;
      document.head.appendChild(link);
    }

    (async () => {
      const maplibregl = await import('maplibre-gl');
      if (cancelled || !ref.current) return;

      const bbox = bboxOf(boundary);
      const center: [number, number] = bbox
        ? [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2]
        : [-84.38, 33.79];

      map = new maplibregl.Map({
        container: ref.current,
        style: CARTO_POSITRON,
        center,
        zoom: 12,
        attributionControl: { compact: true },
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      map.on('load', () => {
        if (!map) return;
        map.addSource('boundary', {
          type: 'geojson',
          data: { type: 'Feature', geometry: boundary, properties: {} },
        });
        map.addLayer({
          id: 'boundary-fill',
          type: 'fill',
          source: 'boundary',
          paint: { 'fill-color': '#c76b3d', 'fill-opacity': 0.18 },
        });
        map.addLayer({
          id: 'boundary-line',
          type: 'line',
          source: 'boundary',
          paint: { 'line-color': '#c76b3d', 'line-width': 2 },
        });
        if (bbox) {
          map.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]],
            ],
            { padding: 40, duration: 0 },
          );
        }
      });
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [boundary]);

  return <div ref={ref} className={className} aria-label="Community boundary map" />;
}
