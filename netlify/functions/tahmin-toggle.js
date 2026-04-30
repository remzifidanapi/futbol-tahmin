// tahmin-toggle.js
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  const admin = verifyToken(event);
  if (!admin) return res(401, { error: 'Yetkisiz' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { id, aktif } = JSON.parse(event.body);
  let query = supabase.from('tahminler').update({ aktif, updated_at: new Date().toISOString() }).eq('id', id);
  if (admin.rol !== 'superadmin') query = query.eq('admin_id', admin.id);
  const { error } = await query;
  if (error) return res(500, { error: error.message });
  return res(200, { success: true });
};
function verifyToken(event) {
  try { return jwt.verify((event.headers.authorization||'').replace('Bearer ',''), process.env.JWT_SECRET); }
  catch { return null; }
}
function res(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}
