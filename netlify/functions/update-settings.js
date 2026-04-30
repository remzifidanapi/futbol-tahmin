// update-settings.js
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  const admin = verifyToken(event);
  if (!admin || admin.rol !== 'superadmin') return res(401, { error: 'Yetkisiz' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  try {
    const updates = JSON.parse(event.body);
    for (const [key, val] of Object.entries(updates)) {
      await supabase.from('site_ayarlari')
        .upsert({ anahtar: key, deger: val, guncelleme_tarihi: new Date().toISOString() }, { onConflict: 'anahtar' });
    }
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
