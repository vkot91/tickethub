/** Where the buyer app lives. Second call site as of FE-4 (the shows table's "view public page"
 *  link and the publish toast), so it stops being a literal in one component's file.
 *
 *  ponytail: a constant, not config. It is the dev origin and the production `app.` subdomain is
 *  the same shape; when the two genuinely differ, this becomes one `NEXT_PUBLIC_` var read here
 *  and nowhere else. */
export const PUBLIC_ORIGIN = 'http://app.localhost:4000';
