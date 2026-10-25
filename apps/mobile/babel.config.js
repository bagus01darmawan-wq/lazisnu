module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    // Inject build-time env (API_URL) into bundle — required for bare RN,
    // where process.env is undefined at runtime. MUST run before worklets.
    ['transform-inline-environment-variables', {include: ['API_URL']}],
    // reanimated 4: worklet runtime pindah ke paket react-native-worklets;
    // plugin HARUS terakhir.
    'react-native-worklets/plugin',
  ],
};
