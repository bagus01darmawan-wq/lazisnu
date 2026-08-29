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
    {
      // Konvensi 2026-08-29: komponen BARU memakai AppPressable (Pressable).
      // Warning hanya di rumah komponen bersama (tempat komponen baru lahir);
      // file lama di luar folder ini tidak berisik.
      files: ['src/components/ui/**/*.tsx'],
      rules: {
        'no-restricted-syntax': [
          'warn',
          {
            selector: "JSXOpeningElement[name.name='TouchableOpacity']",
            message:
              'Gunakan AppPressable (Pressable) untuk komponen baru; TouchableOpacity hanya untuk kode lama.',
          },
        ],
      },
    },
  ],
};
