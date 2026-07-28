import { Skeleton } from '@tickethub/ui';

export default function PublicLoading() {
  return (
    <div className="mx-auto max-w-295 px-6 pt-9 pb-22.5">
      <Skeleton className="mb-3 h-3 w-28" />
      <Skeleton className="mb-2 h-10 w-[24ch]" />
      <Skeleton className="mb-7 h-4 w-[40ch]" />
      <Skeleton className="mb-9 h-70 rounded-panel" />

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4.5">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-70 rounded-card" />
        ))}
      </div>
    </div>
  );
}
