// netlify/functions/admin-login.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { username, password } = JSON.parse(event.body);
    if (!username || !password) return res(400, { error: 'Kullanıcı adı ve şifre gerekli' });

    const { data: admin, error } = await supabase
      .from('admins').select('*').eq('username', username).eq('aktif', true).single();

    if (error || !admin) return res(401, { error: 'Geçersiz kullanıcı adı veya şifre' });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res(401, { error: 'Geçersiz kullanıcı adı veya şifre' });

    const token = jwt.sign(
      { id: admin.id, username: admin.username, rol: admin.rol, isim: admin.isim },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res(200, { success: true, token, rol: admin.rol, isim: admin.isim, id: admin.id });
  } catch (e) {
    return res(500, { error: 'Sunucu hatası: ' + e.message });
  }
};

function res(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}
