const i18next = require('eslint-plugin-i18next');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: ['src/lang/*.js'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      i18next,
    },
    languageOptions: {
      parser: require.resolve('@typescript-eslint/parser'),
    },
    rules: {
      // Add or override i18next rules here if needed
    },
    extends: ['plugin:i18next/recommended'],
  },
];