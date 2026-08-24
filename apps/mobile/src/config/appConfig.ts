/**
 * Konfigurasi aplikasi — SATU SUMBER KEBENARAN untuk nomor versi.
 *
 * File ini juga dibaca oleh android/app/build.gradle (JsonSlurper) saat
 * build native, jadi versionName di APK selalu sama dengan yang tampil
 * di layar Profil. Untuk menaikkan versi, edit appConfig.json SAJA.
 */
import appConfig from './appConfig.json';

export const APP_VERSION: string = appConfig.version;
