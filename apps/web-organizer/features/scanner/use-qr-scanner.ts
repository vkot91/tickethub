'use client';

import { useEffect, useRef, useState } from 'react';

const SCAN_INTERVAL_MS = 400;

export type CameraState = 'idle' | 'running' | 'unsupported' | 'denied';

/**
 * ponytail: the platform's own `BarcodeDetector` rather than a QR library. It covers
 * Chrome, Edge and Android — where gate scanning actually happens — and the manual code
 * entry below it is the path that always works. Swap in `html5-qrcode` if Safari or Firefox
 * ever need to scan too; only this hook would change.
 */
export function useQrScanner(onScan: (code: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>('idle');

  // Kept in a ref so restarting the camera does not depend on the callback's identity.
  const onScanRef = useRef(onScan);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (state !== 'running') return;

    const detectorClass = window.BarcodeDetector;

    if (!detectorClass) {
      setState('unsupported');

      return;
    }

    const detector = new detectorClass({ formats: ['qr_code'] });

    let stream: MediaStream | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
      } catch {
        if (!cancelled) setState('denied');

        return;
      }

      const video = videoRef.current;

      if (cancelled || !video) return;

      video.srcObject = stream;
      await video.play().catch(() => undefined);

      interval = setInterval(async () => {
        const [barcode] = await detector.detect(video).catch(() => []);

        if (barcode) onScanRef.current(barcode.rawValue);
      }, SCAN_INTERVAL_MS);
    }

    start();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [state]);

  return { videoRef, state, start: () => setState('running'), stop: () => setState('idle') };
}
