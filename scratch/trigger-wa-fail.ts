import * as dotenv from 'dotenv';
import path from 'path';

// Load .env from backend before anything else
dotenv.config({ path: path.resolve(__dirname, '../apps/backend/.env') });

import { sendWhatsAppNotification } from '../apps/backend/src/services/whatsapp';

async function triggerFail() {
  console.log('🚀 Mengirim pesan simulasi gagal ke antrean...');
  
  try {
    await sendWhatsAppNotification(
      '000', 
      'Donatur Testing Gagal', 
      50000, 
      'System Tester'
    );
    console.log('✅ Pesan berhasil masuk antrean. Cek log worker!');
  } catch (err) {
    console.error('❌ Gagal memasukkan pesan ke antrean:', err);
  } finally {
    process.exit(0);
  }
}

triggerFail();
