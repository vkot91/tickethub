// Shared ESLint base for plain TypeScript packages (@tickethub/*).
// Consume from a package's .eslintrc.cjs: { root: true, extends: ['@tickethub/eslint-config/base'] }
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'eslint-config-prettier', // turn off rules Prettier owns
  ],
  env: { node: true, es2022: true },
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.config.js', '*.config.cjs'],
  rules: {
    'no-console': 'error',
    'no-debugger': 'error',
    eqeqeq: ['error', 'smart'],
    'no-var': 'error',
    'prefer-const': 'error',
    'no-return-await': 'error',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
  },
  overrides: [
    {
      // Tests and setup may log and use looser typing.
      files: ['**/*.spec.ts', '**/*.test.ts', '**/*.e2e-spec.ts', '**/test/**'],
      env: { jest: true },
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-var-requires': 'off',
      },
    },
    {
      // Standalone CLI/seed scripts print to stdout by design.
      files: ['**/seed/**', '**/scripts/**', '**/*.cli.ts'],
      rules: { 'no-console': 'off' },
    },
  ],
};
