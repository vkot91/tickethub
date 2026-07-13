// Shared ESLint config for the future Next.js web app. Extends base + Next's
// rules. The web app must add `eslint-config-next` to its own devDependencies
// (it's an optional peer here so Nest apps don't pull React/Next tooling).
// Use: { root: true, extends: ['@tickethub/eslint-config/next'] }
module.exports = {
  extends: ['./base.js', 'next/core-web-vitals'],
  env: { browser: true, node: true, es2022: true },
  rules: {
    // Server components / Node console is fine to keep off in Next; flip on per-app if wanted.
    'no-console': 'warn',
  },
};
