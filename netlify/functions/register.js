// register.js - Şifreli kayıt (email, telefon AES; şifre bcrypt)
const { createClient } = require('@supabase/supabase-js');
const Busboy = require('busboy');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function sifrele(metin) {
  if (!metin || !process.env.ENCRYPTION_KEY) return metin;
  const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(metin, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  try {
    const { fields, files } = await parseForm(event);
    const { ad, soyad, email, telefon, telegram, sifre, bayi_kodu, referans_admin_id } = fields;

    if (!ad || !soyad || !email || !telefon || !telegram || !sifre || !bayi_kodu || !referans_admin_id)
      return res(400, { error: 'Tüm alanlar gereklidir' });

    if (sifre.length < 6) return res(400, { error: 'Şifre en az 6 karakter olmalıdır' });

    const { data: admin } = await supabase.from('admins').select('id,isim').eq('id', referans_admin_id).eq('aktif', true).single();
    if (!admin) return res(400, { error: 'Geçersiz referans admin' });

    const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
    const { data: varolan } = await supabase.from('applications').select('id').eq('email_hash', emailHash).maybeSingle();
    if (varolan) return res(400, { error: 'Bu e-posta ile zaten başvuru yapılmış' });

    // Şifre bcrypt ile hashle
    const sifreHash = await bcrypt.hash(sifre, 10);

    let gorsel_url = null;
    if (files.gorsel) {
      const ext = (files.gorsel.filename || 'img').split('.').pop().toLowerCase();
      const fname = `basvurular/${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${ext}`;
      const { error: ue } = await supabase.storage.from('analizhane-uploads').upload(fname, Buffer.from(files.gorsel.data, 'base64'), { contentType: files.gorsel.mimetype });
      if (!ue) { const { data: ud } = supabase.storage.from('analizhane-uploads').getPublicUrl(fname); gorsel_url = ud.publicUrl; }
    }

    const { error } = await supabase.from('applications').insert({
      ad: ad.trim(), soyad: soyad.trim(),
      email_sifrelenmis: sifrele(email.toLowerCase().trim()),
      email_hash: emailHash,
      telefon_sifrelenmis: sifrele(telefon.trim()),
      sifre_hash: sifreHash,
      telegram: telegram.trim().startsWith('@') ? telegram.trim() : '@' + telegram.trim(),
      referans_admin_id, referans_admin_isim: admin.isim,
      bayi_kodu: bayi_kodu.trim(), gorsel_url, durum: 'beklemede'
    });

    if (error) return res(500, { error: 'Kayıt hatası: ' + error.message });
    return res(200, { success: true });
  } catch (e) { return res(500, { error: e.message }); }
};

function parseForm(event) {
  return new Promise((resolve, reject) => {
    const fields = {}, files = {};
    const bb = Busboy({ headers: { 'content-type': event.headers['content-type'] } });
    bb.on('field', (n, v) => fields[n] = v);
    bb.on('file', (n, f, info) => { const c = []; f.on('data', d => c.push(d)); f.on('end', () => { files[n] = { data: Buffer.concat(c).toString('base64'), filename: info.filename, mimetype: info.mimeType }; }); });
    bb.on('finish', () => resolve({ fields, files }));
    bb.on('error', reject);
    bb.write(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
    bb.end();
  });
}
function res(s,b) { return { statusCode:s, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify(b) }; }
