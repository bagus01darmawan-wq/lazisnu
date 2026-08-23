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
import {initCrashlytics} from './src/config/crashlytics';

// Crashlytics di-init di awal agar JS/native crash reporter siap sebelum
// bootstrap app. Pengiriman event tetap disabled saat __DEV__.
initCrashlytics();

AppRegistry.registerComponent(appName, () => App);
