const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  watchFolders: [monorepoRoot],
  resolver: {
    // Catatan upgrade RN 0.88: `unstable_enableSymlinks` dihapus — dukungan
    // symlink kini default ON dan opsinya dibuang dari metro 0.87+.
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    // Workspace ini memuat admin web (React 19.2.4) dan aplikasi mobile
    // (React 19.3.0). Library pihak ketiga yang TIDAK mendeklarasikan `react`
    // sebagai peer dependency — mis. react-native-signature-canvas — mengambil
    // salinan hoisted 19.2.4. Dua instance React dalam satu bundel membuat
    // hook gagal ("Invalid hook call"). Paksa `react` dan subpath-nya ke
    // salinan milik aplikasi mobile.
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'react' || moduleName.startsWith('react/')) {
        try {
          return {
            type: 'sourceFile',
            filePath: require.resolve(moduleName, {paths: [projectRoot]}),
          };
        } catch {
          // Subpath yang tidak diekspor paket react → serahkan ke resolver default.
        }
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
