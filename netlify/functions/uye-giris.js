// uye-giris.js - Email + şifre ile üye girişi
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

function sifrecoz(s) {
  if (!s || !process.env.ENCRYPTION_KEY) return null;
  try {
    const buf = Buffer.from(s, 'base64');
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const dc = crypto.createDecipheriv('aes-256-gcm', key, buf.slice(0,12));
    dc.setAuthTag(buf.slice(12,28));
    return Buffer.concat([dc.update(buf.slice(28)), dc.final()]).toString('utf8');
  } catch { return null; }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  try {
    const { email, sifre } = JSON.parse(event.body);
    if (!email || !sifre) return res(400, { error: 'Email ve şifre gerekli' });

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');

    const { data, error } = await supabase.from('applications')
      .select('ad, soyad, durum, uyelik_bitis_tarihi, sifre_hash')
      .eq('email_hash', emailHash)
      .eq('durum', 'onaylandi')
      .maybeSingle();

    if (error || !data) return res(401, { error: 'E-posta veya şifre hatalı, ya da üyelik henüz onaylanmamış.' });

    // Şifre kontrolü
    const sifreGecerli = await bcrypt.compare(sifre, data.sifre_hash || '');
    if (!sifreGecerli) return res(401, { error: 'E-posta veya şifre hatalı.' });

    // Üyelik tarihi kontrolü
    if (data.uyelik_bitis_tarihi && new Date(data.uyelik_bitis_tarihi) < new Date()) {
      return res(401, { error: 'Üyelik süreniz dolmuştur. Lütfen yöneticinizle iletişime geçin.' });
    }

    return res(200, { success: true, ad: data.ad, soyad: data.soyad });
  } catch (e) { return res(500, { error: e.message }); }
};

function res(s,b) { return { statusCode:s, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify(b) }; }
