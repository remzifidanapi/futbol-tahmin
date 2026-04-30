// get-admins.js
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const admin = verifyToken(event);
  if (!admin || admin.rol !== 'superadmin') return res(401, { error: 'Yetkisiz' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await supabase.from('admins').select('id,username,isim,rol,aktif,created_at').order('created_at');
  if (error) return res(500, { error: error.message });
  return res(200, { admins: data });
};
function verifyToken(event) {
  try { return jwt.verify((event.headers.authorization||'').replace('Bearer ',''), process.env.JWT_SECRET); }
  catch { return null; }
}
function res(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}
