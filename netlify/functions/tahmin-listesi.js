// tahmin-listesi.js
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const admin_id = event.queryStringParameters?.admin_id;
  const hepsi = event.queryStringParameters?.hepsi === '1';

  // Kullanıcı sayfası - aktif tahminler
  if (!event.headers.authorization && !admin_id) {
    const { data, error } = await supabase.from('tahminler').select('*').eq('aktif', true).order('created_at', { ascending: false }).limit(50);
    if (error) return res(500, { error: error.message });
    return res(200, { tahminler: data });
  }

  // Admin - kendi tahminleri
  const admin = verifyToken(event);
  if (!admin) return res(401, { error: 'Yetkisiz' });
  let query = supabase.from('tahminler').select('*').order('created_at', { ascending: false });
  if (admin.rol !== 'superadmin') query = query.eq('admin_id', admin.id);
  const { data, error } = await query;
  if (error) return res(500, { error: error.message });
  return res(200, { tahminler: data });
};
function verifyToken(event) {
  try { return jwt.verify((event.headers.authorization||'').replace('Bearer ',''), process.env.JWT_SECRET); }
  catch { return null; }
}
function res(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}
