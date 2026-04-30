const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

function sifrecoz(s) {
  if (!s || !process.env.ENCRYPTION_KEY) return '***';
  try {
    const buf = Buffer.from(s, 'base64');
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const dc = crypto.createDecipheriv('aes-256-gcm', key, buf.slice(0,12));
    dc.setAuthTag(buf.slice(12,28));
    return Buffer.concat([dc.update(buf.slice(28)), dc.final()]).toString('utf8');
  } catch { return '[Hata]'; }
}
function maskTel(t) { if (!t || t.length<7) return '***'; const s=t.replace(/\s/g,''); return s.substring(0,4)+'***'+s.substring(7); }
function maskEmail(e) { if (!e) return '***'; const [u,d]=e.split('@'); if(!d) return '***'; return u[0]+'***@'+d; }

exports.handler = async (event) => {
  const admin = verify(event);
  if (!admin || admin.rol !== 'superadmin') return res(401, { error: 'Yetkisiz' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase.from('applications')
    .select('id,ad,soyad,email_sifrelenmis,telefon_sifrelenmis,telegram,referans_admin_isim,bayi_kodu,gorsel_url,durum,uyelik_bitis_tarihi,telegram_davet_gonderildi,notlar,created_at,updated_at')
    .order('created_at', { ascending: false });
  if (error) return res(500, { error: error.message });
  const applications = (data||[]).map(a => {
    const emailAcik = sifrecoz(a.email_sifrelenmis);
    const telAcik = sifrecoz(a.telefon_sifrelenmis);
    return { ...a, email: maskEmail(emailAcik), email_tam: emailAcik, telefon: maskTel(telAcik), telefon_tam: telAcik, email_sifrelenmis: undefined, telefon_sifrelenmis: undefined };
  });
  return res(200, { applications });
};
function verify(e) { try { return jwt.verify((e.headers.authorization||'').replace('Bearer ',''), process.env.JWT_SECRET); } catch { return null; } }
function res(s,b) { return { statusCode:s, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}, body:JSON.stringify(b) }; }
