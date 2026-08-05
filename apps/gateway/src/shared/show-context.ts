import { seatLabel } from '@tickethub/common';

/** What one show contributes to a row: its title, and a label per seat id. */
export interface ShowContext {
  title: string;
  labels: Map<string, string>;
}

/** All this merge needs of a row: which show, and which seats. The rest rides along untouched. */
interface Contextual {
  showId: string;
  seats: { seatId: string }[];
}

/** What a show that could not be resolved is called, wherever the merge gives up on it. */
export const UNKNOWN_SHOW_TITLE = 'Unavailable show';

const UNKNOWN_SHOW: ShowContext = { title: UNKNOWN_SHOW_TITLE, labels: new Map() };

/**
 * Orders owns the order; Shows owns the title and the seat labels. No cross-service JOIN exists
 * to get both, so the gateway fans out — once per *distinct show*, not once per order — and a show
 * that has been cancelled or purged degrades one column instead of failing the page.
 *
 * The fetch is injected rather than hardcoded, and that is the whole point of this file living in
 * `shared/`: dedupe, fan-out and tolerance are identical for buyer, organizer and admin, but the
 * routing keys are not. Each audience folder passes its own — so nothing here names a key, and a
 * third audience adds a `fetchShow` and changes nothing else.
 */
export async function withShowContext<T extends Contextual>(
  items: T[],
  fetchShow: (showId: string) => Promise<ShowContext>,
): Promise<(T & { showTitle: string; seatLabels: string[] })[]> {
  const showIds = [...new Set(items.map((item) => item.showId))];

  const contexts = new Map(
    await Promise.all(
      showIds.map(async (showId) => {
        try {
          return [showId, await fetchShow(showId)] as const;
        } catch {
          // A cancelled or purged show must not take the whole orders page down with it.
          return [showId, UNKNOWN_SHOW] as const;
        }
      }),
    ),
  );

  return items.map((item) => {
    const context = contexts.get(item.showId) ?? UNKNOWN_SHOW;

    return {
      ...item,
      showTitle: context.title,
      seatLabels: item.seats.flatMap((seat) => context.labels.get(seat.seatId) ?? []),
    };
  });
}

/** Flattens a buyer seat map's geometry into the `seatId → label` half of a `ShowContext`. */
export function labelsFromSeatMap(
  sections: {
    name: string;
    rows: { number: number; seats: { id: string; number: number }[] }[];
  }[],
): Map<string, string> {
  const labels = new Map<string, string>();

  for (const section of sections) {
    for (const row of section.rows) {
      for (const seat of row.seats)
        labels.set(seat.id, seatLabel(section.name, row.number, seat.number));
    }
  }

  return labels;
}
