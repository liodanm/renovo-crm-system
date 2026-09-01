'use client';

/**
 * DIAGNOSTIC ONLY — not linked from any nav, not part of the Quote Tool.
 * Delete this file and frontend/app/map-test/page.tsx once the blank-
 * tile investigation is closed.
 *
 * Purpose: isolate whether the still-unresolved blank-tile-on-zoom bug
 * lives in Renovo's app/CSS/component tree, or in Leaflet + this exact
 * Mapbox tile config on their own. This is the ONLY thing this file
 * contains: MapContainer, TileLayer (same URL/maxNativeZoom/maxZoom as
 * production), and zoom controls. No polygon drawing, no measurement
 * state, no conditional service logic, no QuoteWidgetClient, no
 * pricing, no customer data.
 *
 * How to use: deploy, open /map-test, zoom in the same way the Quote
 * Tool map is zoomed (same number of steps, same general area/zoom
 * level if possible) and report back:
 *   - Does this ALSO go blank? -> the bug is in Leaflet/Mapbox/this
 *     tile config itself, not in Renovo's surrounding app code. Next
 *     step would be a config change (e.g. maxNativeZoom) or a
 *     different tile source/API — but only once this test proves it.
 *   - Does this NOT go blank, and stays visible all the way to z21? ->
 *     the bug is specific to something in PropertyMeasurementMap's
 *     surrounding tree (QuoteWidgetClient, globals.css, a wrapping
 *     container's CSS, dark-mode overrides, etc.) and needs comparing
 *     line-by-line against this file, not another tile-config change.
 */

import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// Same generic Coral Springs, FL coordinates as the market this bug has
// been reproduced in — exact address doesn't matter for this test,
// since the production Network tab evidence already showed 200/cached
// tile responses at the zoom level where it goes blank (ruling out a
// missing-imagery/coverage problem specifically).
const TEST_LAT = 26.2711;
const TEST_LON = -80.2706;

export function MinimalMapDiagnostic() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

  if (!mapboxToken) {
    return <p style={{ padding: 16 }}>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN is not set in this environment.</p>;
  }

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      {/* Deliberately IDENTICAL config to PropertyMeasurementMap.tsx's
          current production values — this is the control. If you
          change anything here to test a theory, note it, don't
          silently drift from production's actual config. */}
      <MapContainer center={[TEST_LAT, TEST_LON]} zoom={19} maxZoom={21} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url={`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}.png?access_token=${mapboxToken}`}
          maxNativeZoom={18}
        />
      </MapContainer>
    </div>
  );
}
