// admin-ekle.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  const admin = verifyToken(event);
  if (!admin || admin.rol !== 'superadmin') return res(401, { error: 'Yetkisiz' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  try {
    const { isim, username, sifre, rol } = JSON.parse(event.body);
    if (!isim || !username || !sifre) return res(400, { error: 'Tüm alanlar gerekli' });
    const hash = await bcrypt.hash(sifre, 10);
    const { error } = await supabase.from('admins').insert({ isim, username, password_hash: hash, rol: rol || 'admin', aktif: true });
    if (error) return res(500, { error: error.message.includes('unique') ? 'Bu kullanıcı adı zaten kullanılıyor' : error.message });
    return res(200, { success: true });
  } catch(e) { return res(500, { error: e.message }); }
};
function verifyToken(event) {
  try { return jwt.verify((event.headers.authorization||'').replace('Bearer ',''), process.env.JWT_SECRET); }
  catch { return null; }
}
function res(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}
