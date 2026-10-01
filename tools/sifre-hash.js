#!/usr/bin/env node
// Admin şifresi için bcrypt hash üretir ve Supabase'de çalıştıracağınız
// UPDATE komutunu yazdırır.
//
// Kullanım:
//   npm install
//   node tools/sifre-hash.js superadmin 'YeniGucluSifre!2026'
//
// Çıkan SQL'i Supabase > SQL Editor'de çalıştırın. Ürettiğiniz hash'i
// depoya COMMIT ETMEYİN.

const bcrypt = require('bcryptjs');

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('Kullanım: node tools/sifre-hash.js <kullanici_adi> <sifre>');
  process.exit(1);
}
if (password.length < 10) {
  console.error('Hata: şifre en az 10 karakter olmalı.');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);

// Ürettiğimiz hash'in gerçekten doğrulandığını teyit et.
if (!bcrypt.compareSync(password, hash)) {
  console.error('Hata: hash doğrulanamadı, işlemi tekrarlayın.');
  process.exit(1);
}

const esc = (s) => s.replace(/'/g, "''");

console.log('\nHash: ' + hash + '\n');
console.log('-- Supabase SQL Editor\'de çalıştırın:');
console.log(
  `UPDATE admins SET password_hash = '${esc(hash)}', aktif = true ` +
  `WHERE username = '${esc(username)}';`
);
console.log(`\n-- Kullanıcı yoksa önce oluşturun (rol: admin veya superadmin):`);
console.log(
  `INSERT INTO admins (username, password_hash, isim, rol, aktif)\n` +
  `VALUES ('${esc(username)}', '${esc(hash)}', '${esc(username)}', 'superadmin', true)\n` +
  `ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, aktif = true;`
);
console.log('');
