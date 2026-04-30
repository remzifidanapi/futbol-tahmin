// ============================================
// netlify/functions/reject.js
// ============================================
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const sb = () => createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const verifyToken = (event) => {
  try { return jwt.verify((event.headers.authorization||'').replace('Bearer ',''), process.env.JWT_SECRET); }
  catch { return null; }
};
const res = (status, body) => ({
  statusCode: status,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  body: JSON.stringify(body)
});

// Bu dosya birden fazla fonksiyon için template görevi görüyor.
// Her biri ayrı dosyaya yazılmalı. Aşağıdaki exports bu dosyanın handler'ı.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  const admin = verifyToken(event);
  if (!admin || admin.rol !== 'superadmin') return res(401, { error: 'Yetkisiz' });
  try {
    const { id } = JSON.parse(event.body);
    const { error } = await sb().from('applications').update({ durum: 'reddedildi', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return res(500, { error: error.message });
    return res(200, { success: true });
  } catch(e) { return res(500, { error: e.message }); }
};
