'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { Button, Card, Field, Input } from '@tickethub/ui';

import { checkIn, type CheckInResult } from '../api';
import { CheckInPanel } from './check-in-result';
import { useQrScanner } from './use-qr-scanner';

const RECENT_LIMIT = 6;

const cameraCopy = {
  idle: 'Camera off',
  running: 'Scanning…',
  unsupported: 'This browser cannot scan — type the code instead',
  denied: 'Camera permission denied — type the code instead',
} as const;

interface RecentScan {
  key: number;
  code: string;
  result: CheckInResult['result'];
}

export function Scanner() {
  const [recent, setRecent] = useState<RecentScan[]>([]);

  const check = useMutation({
    mutationFn: checkIn,
    onSuccess: (outcome, code) =>
      setRecent((scans) =>
        [{ key: Date.now(), code, result: outcome.result }, ...scans].slice(0, RECENT_LIMIT),
      ),
  });

  // Stable identity: the scan loop holds on to this between frames.
  const onScan = useCallback(
    (code: string) => {
      if (!check.isPending) check.mutate(code);
    },
    [check],
  );

  const camera = useQrScanner(onScan);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card padding="lg" radius="panel">
        <div className="relative mb-4 h-60 overflow-hidden rounded-control bg-deep">
          <video ref={camera.videoRef} muted playsInline className="size-full object-cover" />

          {/* Corner brackets and the sweeping line, straight from the design. */}
          <span className="pointer-events-none absolute inset-4">
            {[
              'top-0 left-0 border-t-2 border-l-2',
              'top-0 right-0 border-t-2 border-r-2',
              'bottom-0 left-0 border-b-2 border-l-2',
              'bottom-0 right-0 border-b-2 border-r-2',
            ].map((corner) => (
              <span key={corner} className={`absolute size-6 border-accent ${corner}`} />
            ))}
          </span>

          {camera.state === 'running' ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-6 top-4 h-0.5 bg-accent shadow-[0_0_12px_var(--color-accent)] animate-scan"
            />
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-[11px] tracking-[0.1em] text-fg-faint uppercase">
            {cameraCopy[camera.state]}
          </p>

          <Button
            size="sm"
            variant={camera.state === 'running' ? 'secondary' : 'primary'}
            onClick={camera.state === 'running' ? camera.stop : camera.start}
          >
            {camera.state === 'running' ? 'Stop camera' : 'Start camera'}
          </Button>
        </div>

        <form
          className="mt-5 flex items-end gap-3"
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();

            const code = new FormData(submitEvent.currentTarget).get('code');

            if (code) check.mutate(String(code));
          }}
        >
          <Field label="Ticket code" htmlFor="code" className="flex-1">
            <Input id="code" name="code" placeholder="TH-…" required />
          </Field>
          <Button type="submit" size="sm" disabled={check.isPending}>
            Check in
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-6">
        {check.data ? <CheckInPanel result={check.data} /> : null}

        {check.isError ? (
          <p role="alert" className="text-[13px] text-danger">
            {check.error.message}
          </p>
        ) : null}

        {check.data ? (
          <Card padding="lg">
            <div className="mb-3 flex items-baseline justify-between">
              <span className="font-mono text-[10px] tracking-[0.1em] text-fg-faint uppercase">
                Checked in
              </span>
              <span className="font-mono text-sm">
                {check.data.checkedInCount} / {check.data.capacity}
              </span>
            </div>

            <ProgressPrimitive.Root
              value={(check.data.checkedInCount / Math.max(1, check.data.capacity)) * 100}
              className="h-1.5 overflow-hidden rounded-pill bg-white/5"
            >
              <ProgressPrimitive.Indicator
                style={{
                  width: `${(check.data.checkedInCount / Math.max(1, check.data.capacity)) * 100}%`,
                }}
                className="h-full bg-success"
              />
            </ProgressPrimitive.Root>
          </Card>
        ) : null}

        {recent.length > 0 ? (
          <Card padding="lg">
            <h2 className="mb-4 font-mono text-[10px] tracking-[0.1em] text-fg-faint uppercase">
              Recent scans
            </h2>
            <ul className="flex flex-col gap-2.5">
              {recent.map((scan) => (
                <li key={scan.key} className="flex items-center gap-3 font-mono text-xs">
                  <span
                    aria-hidden
                    className={`size-2 rounded-pill ${
                      scan.result === 'valid'
                        ? 'bg-success'
                        : scan.result === 'used'
                          ? 'bg-warn'
                          : 'bg-danger'
                    }`}
                  />
                  <span className="flex-1 truncate text-fg-secondary">{scan.code}</span>
                  <span className="text-fg-faint">{scan.result}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
