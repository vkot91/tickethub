# @tickethub/ui

Design-token CSS and the Radix-based primitives shared by `apps/web` and `apps/organizer`.

Ships **TypeScript source, not a build** — both consumers are Next apps that already compile
TSX, so they list it in `transpilePackages` and skip a redundant tsc step.

```ts
import { Button, Card, formatPrice } from '@tickethub/ui';
```

Layout — `src/lib/` (`cn`, formatters), `src/primitives/` (one Radix/`cva` wrapper each),
`src/composites/` (built from primitives), `src/domain/` (ticketing-aware: show/order status,
tiers). `src/index.ts` is the only entry point; consumers never deep-import.

```css
/* app/globals.css */
@import 'tailwindcss';
@import '@tickethub/ui/styles.css';
```

`styles.css` carries the `@theme` token block from `design/README.md` plus a `@source "./"`, so
Tailwind scans this package's own components — node_modules is not crawled by default.

Presentational only. Nothing here reads a cookie, calls the gateway or imports `next/headers`;
that plumbing is `@tickethub/web-kit`.
