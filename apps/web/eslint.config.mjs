// eslint.config.mjs — Native Flat Config untuk ESLint v9
// eslint-config-next v16.2.4 sudah mengekspor format Flat Config secara native,
// sehingga kita bisa import langsung tanpa perantara FlatCompat.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/** @type {import("eslint").Linter.Config[]} */
const eslintConfig = [
  // Aturan dasar Next.js (React, JSX, import, accessibility, dll.)
  ...nextCoreWebVitals,
  // Aturan TypeScript (typescript-eslint recommended + rules next/typescript)
  ...nextTypescript,
];

export default eslintConfig;
