/**
 * @format
 */

import {AppRegistry} from 'react-native';
import * as Sentry from '@sentry/react-native';
import App from './App';
import {name as appName} from './app.json';

// Inisialisasi Sentry (ganti DSN dengan yang asli nanti)
// Sentry.init({
//   dsn: 'YOUR_SENTRY_DSN_HERE',
//   tracesSampleRate: 1.0,
// });

AppRegistry.registerComponent(appName, () => App);

