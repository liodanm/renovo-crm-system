'use client';

import { useCallback, useState } from 'react';

export interface GpsResult {
  latitude?: number;
  longitude?: number;
}

/**
 * A field tech's phone may have GPS disabled, be indoors with a weak
 * signal, or simply deny the permission prompt — none of that should
 * ever block Start/Complete/adding a chemical. Every caller treats the
 * resolved coordinates as optional and proceeds either way; this hook
 * only ever resolves, never rejects, specifically so nothing upstream
 * has to special-case a GPS failure.
 */
export function useGeolocation() {
  const [isCapturing, setIsCapturing] = useState(false);

  const capture = useCallback((): Promise<GpsResult> => {
    setIsCapturing(true);
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setIsCapturing(false);
        resolve({});
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setIsCapturing(false);
          resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        },
        () => {
          setIsCapturing(false);
          resolve({});
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      );
    });
  }, []);

  return { capture, isCapturing };
}
