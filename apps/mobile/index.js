/**
 * @format
 */

// Polyfill crypto.getRandomValues() untuk Hermes engine.
// Harus di-import SEBELUM kode app lain agar crypto.randomUUID()
// tersedia di seluruh codebase. react-native-get-random-values
// sudah ter-install di package.json.
import 'react-native-get-random-values';

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {initSentry} from './src/config/sentry';

// Sentry HARUS di-init SEBELUM app code lain, agar error di module
// initialization bisa ter-capture. Init ada di awal pipeline (P4.5).
initSentry();

AppRegistry.registerComponent(appName, () => App);

