module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Inject build-time env (API_URL) into bundle — required for bare RN,
    // where process.env is undefined at runtime. MUST run before reanimated.
    ['transform-inline-environment-variables', { include: ['API_URL'] }],
    // reanimated plugin MUST be listed last.
    'react-native-reanimated/plugin',
  ],
};
