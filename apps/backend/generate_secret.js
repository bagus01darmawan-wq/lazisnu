const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
const secret = crypto.randomBytes(32).toString('hex');

let envContent = '';
if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

if (envContent.includes('APP_SECRET=')) {
  envContent = envContent.replace(/APP_SECRET=.*/, `APP_SECRET=${secret}`);
  console.log('✅ APP_SECRET berhasil diupdate di .env');
} else {
  envContent += `\nAPP_SECRET=${secret}\n`;
  console.log('✅ APP_SECRET berhasil ditambahkan ke .env');
}

fs.writeFileSync(envPath, envContent);
console.log('Nilai secret yang di-generate: ' + secret);
