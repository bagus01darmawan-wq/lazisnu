module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'prettier/prettier': 0,
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    'react-hooks/exhaustive-deps': 'warn',
    'react-native/no-inline-styles': 0,
    'react/no-unstable-nested-components': 'warn',
    'no-unused-vars': 0,
    // Rule ini dihapus di @typescript-eslint v8+ (digantikan oleh @stylistic/func-call-spacing).
    // Di-override menjadi 'off' agar kompatibel dengan @react-native/eslint-config 0.74.x
    // yang masih mereferensikannya secara internal.
    '@typescript-eslint/func-call-spacing': 'off',
  },
};

