module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['coverage/', 'node_modules/', 'android/', 'ios/'],
  rules: {
    'prettier/prettier': 0,
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    'react-hooks/exhaustive-deps': 'error',
    'react-native/no-inline-styles': 'error',
    'react/no-unstable-nested-components': 'warn',
    'no-unused-vars': 0,
    // Rule ini dihapus di @typescript-eslint v8+ (digantikan oleh @stylistic/func-call-spacing).
    // Di-override menjadi 'off' agar kompatibel dengan @react-native/eslint-config 0.74.x
    // yang masih mereferensikannya secara internal.
    '@typescript-eslint/func-call-spacing': 'off',
  },
  overrides: [
    {
      files: ['__tests__/**/*', '__mocks__/**/*'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
