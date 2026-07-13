// Shared ESLint config for NestJS apps. Extends base, relaxes rules that fight
// Nest's decorator/DI idioms. Use: { root: true, extends: ['@tickethub/eslint-config/nest'] }
module.exports = {
  extends: ['./base.js'],
  env: { node: true, jest: true },
  rules: {
    // DI relies on empty constructors and parameter properties.
    '@typescript-eslint/no-useless-constructor': 'off',
    '@typescript-eslint/no-empty-function': ['error', { allow: ['constructors'] }],
    // Decorators (@Injectable, @Module) read as unused expressions to some rules.
    '@typescript-eslint/no-extraneous-class': 'off',
  },
};
