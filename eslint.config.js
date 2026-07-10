import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['admin/**', 'node_modules/**'],
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      ...eslintConfigPrettier.rules,
      'no-console': 'off',
    },
  },
]
