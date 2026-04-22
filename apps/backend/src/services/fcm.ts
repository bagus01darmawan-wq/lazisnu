// Firebase Cloud Messaging (FCM) Service
// Mengirim push notification ke device petugas

import { config } from '../config/env';

let firebaseAdmin: any = null;

/**
 * Inisialisasi Firebase Admin SDK dengan graceful fallback
 * jika credential tidak dikonfigurasi.
 */
function getFirebaseApp() {
  if (firebaseAdmin) return firebaseAdmin;

  if (!config.FIREBASE_PROJECT_ID || !config.FIREBASE_PRIVATE_KEY || !config.FIREBASE_CLIENT_EMAIL) {
    console.warn('⚠️ [FCM] Firebase credentials tidak dikonfigurasi. Push notification dinonaktifkan.');
    return null;
  }

  try {
    const admin = require('firebase-admin');
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: config.FIREBASE_PROJECT_ID,
          privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          clientEmail: config.FIREBASE_CLIENT_EMAIL,
        }),
      });
    }
    firebaseAdmin = admin;
    console.log('✅ [FCM] Firebase Admin SDK berhasil diinisialisasi.');
    return admin;
  } catch (err) {
    console.error('❌ [FCM] Gagal inisialisasi Firebase:', err);
    return null;
  }
}

/**
 * Kirim notifikasi ke satu device via FCM token
 */
export async function sendFCMToDevice(params: {
  fcmToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const admin = getFirebaseApp();
  if (!admin) {
    return { success: false, error: 'FCM tidak dikonfigurasi' };
  }

  try {
    const message = {
      token: params.fcmToken,
      notification: {
        title: params.title,
        body: params.body,
      },
      data: params.data || {},
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'lazisnu_default',
          sound: 'default',
        },
      },
    };

    const messageId = await admin.messaging().send(message);
    return { success: true, messageId };
  } catch (err: any) {
    console.error('[FCM] Gagal kirim notifikasi:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Kirim notifikasi penugasan baru ke petugas
 */
export async function sendAssignmentNotification(params: {
  fcmToken: string;
  officerName: string;
  canCount: number;
  month: number;
  year: number;
}): Promise<{ success: boolean; error?: string }> {
  const monthNames = [
    '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  return sendFCMToDevice({
    fcmToken: params.fcmToken,
    title: '📋 Penugasan Baru',
    body: `${params.officerName}, Anda memiliki ${params.canCount} tugas baru untuk bulan ${monthNames[params.month]} ${params.year}.`,
    data: {
      type: 'NEW_ASSIGNMENT',
      month: params.month.toString(),
      year: params.year.toString(),
    },
  });
}
