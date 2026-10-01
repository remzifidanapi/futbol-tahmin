// netlify/functions/admin-login.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_SECRET } = process.env;

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return res(200, {});
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });

  // Eksik ortam değişkenlerini baştan bildir; aksi halde createClient veya
  // jwt.sign içeride patlıyor ve kullanıcıya anlamsız bir 500 dönüyordu.
  const eksik = [];
  if (!SUPABASE_URL) eksik.push('SUPABASE_URL');
  if (!SUPABASE_SERVICE_KEY) eksik.push('SUPABASE_SERVICE_KEY');
  if (!JWT_SECRET) eksik.push('JWT_SECRET');
  if (eksik.length) {
    console.error('admin-login: eksik ortam değişkeni:', eksik.join(', '));
    return res(500, { error: 'Sunucu yapılandırması eksik: ' + eksik.join(', ') });
  }

  try {
    let username, password;
    try { ({ username, password } = JSON.parse(event.body || '{}')); }
    catch (e) { return res(400, { error: 'Geçersiz istek gövdesi' }); }

    if (!username || !password) return res(400, { error: 'Kullanıcı adı ve şifre gerekli' });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // maybeSingle(): kayıt yoksa hata değil null döner, böylece "bulunamadı" ile
    // gerçek veritabanı hatasını birbirinden ayırabiliyoruz.
    const { data: admin, error } = await supabase
      .from('admins')
      .select('id, username, password_hash, isim, rol, aktif')
      .eq('username', username)
      .eq('aktif', true)
      .maybeSingle();

    if (error) {
      console.error('admin-login: supabase hatası:', error.message);
      return res(500, { error: 'Veritabanı hatası' });
    }
    if (!admin || !admin.password_hash) return res(401, { error: 'Geçersiz kullanıcı adı veya şifre' });

    const valid = await bcrypt.compare(password, admin.password_hash);
    if (!valid) return res(401, { error: 'Geçersiz kullanıcı adı veya şifre' });

    const token = jwt.sign(
      { id: admin.id, username: admin.username, rol: admin.rol, isim: admin.isim },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res(200, { success: true, token, rol: admin.rol, isim: admin.isim, id: admin.id });
  } catch (e) {
    console.error('admin-login: beklenmeyen hata:', e);
    return res(500, { error: 'Sunucu hatası: ' + e.message });
  }
};

function res(status, body) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}
