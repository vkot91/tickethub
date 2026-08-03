'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import type { OrganizerShow } from '@tickethub/contracts';
import { Button, cn, Poster, Progress } from '@tickethub/ui';

import { createPosterUploadUrl, showKeys, updateShow } from '../api';
import { posterRejection, putPoster } from './upload-poster';

interface PosterPanelProps {
  show: OrganizerShow;
  /** A cancelled or finished show is history: the artwork stays, the controls go. */
  readOnly?: boolean;
}

export function PosterPanel({ show, readOnly }: PosterPanelProps) {
  const [percent, setPercent] = useState<number>();
  const [error, setError] = useState<string>();

  const fileInput = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      // Presign, PUT, then PATCH — the show only points at the object once the object exists.
      const { uploadUrl, posterUrl } = await createPosterUploadUrl(show.id, file.type);

      await putPoster(uploadUrl, file, setPercent);

      await updateShow(show.id, { posterUrl });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: showKeys.all }),
    onError: (failure) => setError(failure.message),
    onSettled: () => setPercent(undefined),
  });

  const clear = useMutation({
    mutationFn: () => updateShow(show.id, { posterUrl: null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: showKeys.all }),
  });

  function onPick(file: File | undefined) {
    if (!file) return;

    setError(undefined);

    const rejection = posterRejection(file);

    if (rejection) return setError(rejection);

    setPercent(0);
    upload.mutate(file);
  }

  const isUploading = upload.isPending;

  return (
    <div className="flex flex-col gap-3">
      <Poster
        seed={show.id}
        src={show.posterUrl}
        className={cn(
          'flex aspect-[3/4] items-center justify-center rounded-panel border border-dashed border-white/16',
          error && 'border-danger/40',
          isUploading && 'opacity-60',
        )}
      >
        {isUploading ? (
          <div className="absolute inset-x-6 bottom-[28%] flex flex-col items-center gap-2">
            <Progress value={percent ?? 0} max={100} label="Uploading poster" className="w-full" />
            <span className="font-mono text-[11px] text-fg-secondary">{percent ?? 0}%</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 px-6 text-center">
            <p role="alert" className="text-[13px] text-danger">
              {error}
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              Try again
            </Button>
          </div>
        ) : show.posterUrl ? (
          !readOnly && (
            <div className="absolute inset-x-3 bottom-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => fileInput.current?.click()}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label="Remove poster"
                disabled={clear.isPending}
                onClick={() => clear.mutate()}
              >
                ×
              </Button>
            </div>
          )
        ) : (
          !readOnly && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-control border-dashed font-mono text-[11px] tracking-[0.1em] text-fg-muted"
              onClick={() => fileInput.current?.click()}
            >
              POSTER 3:4 — CLICK TO UPLOAD
            </Button>
          )
        )}
      </Poster>

      <input
        ref={fileInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Poster image"
        onChange={(pick) => {
          onPick(pick.target.files?.[0]);
          // Cleared so picking the same file twice after a failure still fires a change.
          pick.target.value = '';
        }}
      />
    </div>
  );
}
