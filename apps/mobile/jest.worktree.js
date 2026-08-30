// Workaround lokal: testMatch berbasis glob gagal di path worktree yang
// mengandung folder ber-dot (.qoder) — micromatch melewatkan segmen ber-dot.
// Pakai testRegex agar discovery test tetap jalan di worktree.
const base = require('./jest.config.js');

module.exports = {
  ...base,
  testMatch: undefined,
  testRegex: '(/__tests__/|(\\.|/)(test|spec))\\.[jt]sx?$',
};
