// netlify/functions/auth.js
const {
  getCORS, checkRateLimit, hashPassword, generateToken,
  sanitize, isValidEmail, ok, err, opts, db,
  verifyUserSession,
} = require('./_security');

exports.handler = async function(event) {
  const origin = event.headers['origin'] || '';
  const cors = getCORS(origin);
  if (event.httpMethod === 'OPTIONS') return opts(cors);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  const rawPath = event.path || '/';
  const path = rawPath.replace('/.netlify/functions/auth','').replace('/api/auth','').replace(/\/$/,'') || '/';
  const method = event.httpMethod;
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  const getToken = () => (event.headers['authorization'] || '').replace('Bearer ','').trim();

  // ── KAYIT ──
  if (path === '/register' && method === 'POST') {
    const rl = checkRateLimit(`reg:${ip}`, 'register');
    if (rl.blocked) return err(`Çok fazla deneme. ${rl.remaining} dk bekleyin.`, 429, cors);

    const email    = sanitize(body.email || '');
    const phone    = sanitize(body.phone || '');
    const fullName = sanitize(body.full_name || '');
    const password = body.password || '';

    if (!email || !password || !phone) return err('Tüm alanlar zorunlu', 400, cors);
    if (!isValidEmail(email)) return err('Geçersiz e-posta', 400, cors);
    if (password.length < 6) return err('Şifre en az 6 karakter', 400, cors);

    const check = await db('GET', 'users', null, `?email=eq.${encodeURIComponent(email)}&select=id`);
    if (check.data && check.data.length > 0) return err('Bu e-posta zaten kayıtlı', 409, cors);

    const res = await db('POST', 'users', {
      email, phone, full_name: fullName,
      password_hash: hashPassword(password),
      is_approved: false, is_active: true,
    });
    if (!res.ok) return err('Kayıt başarısız', 500, cors);
    return ok({ message: 'Kayıt başarılı! Admin onayı bekleniyor.' }, 201, cors);
  }

  // ── GİRİŞ ──
  if (path === '/login' && method === 'POST') {
    const rl = checkRateLimit(`login:${ip}`, 'login');
    if (rl.blocked) return err(`Çok fazla deneme. ${rl.remaining} dk bekleyin.`, 429, cors);

    const email    = sanitize(body.email || '');
    const password = body.password || '';
    if (!email || !password) return err('E-posta ve şifre zorunlu', 400, cors);

    const res = await db('GET', 'users', null, `?email=eq.${encodeURIComponent(email)}&select=*`);
    if (!res.ok || !res.data || !res.data[0]) return err('E-posta veya şifre hatalı', 401, cors);

    const user = res.data[0];
    if (user.password_hash !== hashPassword(password)) return err('E-posta veya şifre hatalı', 401, cors);
    if (!user.is_approved) return err('Hesabınız henüz onaylanmamış.', 403, cors);
    if (!user.is_active)   return err('Hesabınız askıya alınmıştır.', 403, cors);
    if (user.access_end && new Date(user.access_end) < new Date()) return err('Erişim süreniz dolmuştur.', 403, cors);

    const token   = generateToken();
    const expires = new Date(Date.now() + 7*24*60*60*1000).toISOString();
    await db('POST', 'sessions', {
      user_id: user.id, token, expires_at: expires,
      ip_address: ip, user_agent: event.headers['user-agent'] || '',
    });
    await db('PATCH', 'users', { last_login: new Date().toISOString() }, `?id=eq.${user.id}`);

    const daysLeft = user.access_end
      ? Math.max(0, Math.ceil((new Date(user.access_end)-new Date())/(1000*60*60*24)))
      : null;

    return ok({
      token,
      user: { id:user.id, email:user.email, full_name:user.full_name, phone:user.phone,
               days_left:daysLeft, access_end:user.access_end, last_login:user.last_login },
    }, 200, cors);
  }

  // ── DOĞRULAMA ──
  if (path === '/verify' && method === 'GET') {
    const result = await verifyUserSession(getToken());
    if (!result) return err('Oturum geçersiz', 401, cors);
    const u = result.user;
    const daysLeft = u.access_end
      ? Math.max(0, Math.ceil((new Date(u.access_end)-new Date())/(1000*60*60*24)))
      : null;
    return ok({ user: { id:u.id, email:u.email, full_name:u.full_name, phone:u.phone,
                         days_left:daysLeft, access_end:u.access_end } }, 200, cors);
  }

  // ── ÇIKIŞ ──
  if (path === '/logout' && method === 'POST') {
    const token = getToken();
    if (token) await db('DELETE', 'sessions', null, `?token=eq.${token}`);
    return ok({ message: 'Çıkış yapıldı' }, 200, cors);
  }

  // ── TÜM CİHAZLARDAN ÇIKIŞ ──
  if (path === '/logout-all' && method === 'POST') {
    const result = await verifyUserSession(getToken());
    if (!result) return err('Yetkisiz', 401, cors);
    await db('DELETE', 'sessions', null, `?user_id=eq.${result.user.id}`);
    return ok({ message: 'Tüm cihazlardan çıkış yapıldı' }, 200, cors);
  }

  // ── PROFİL GÜNCELLE ──
  if (path === '/profile' && method === 'PUT') {
    const result = await verifyUserSession(getToken());
    if (!result) return err('Yetkisiz', 401, cors);
    const updates = {};
    if (body.full_name) updates.full_name = sanitize(body.full_name);
    if (body.phone)     updates.phone     = sanitize(body.phone);
    if (!Object.keys(updates).length) return err('Güncellenecek alan yok', 400, cors);
    await db('PATCH', 'users', updates, `?id=eq.${result.user.id}`);
    return ok({ message: 'Profil güncellendi' }, 200, cors);
  }

  // ── ŞİFRE DEĞİŞTİR ──
  if (path === '/change-password' && method === 'POST') {
    const result = await verifyUserSession(getToken());
    if (!result) return err('Yetkisiz', 401, cors);
    const { old_password, new_password } = body;
    if (!old_password || !new_password) return err('Eski ve yeni şifre gerekli', 400, cors);
    if (new_password.length < 6) return err('Şifre en az 6 karakter', 400, cors);
    const userRes = await db('GET', 'users', null, `?id=eq.${result.user.id}&select=password_hash`);
    if (!userRes.data[0] || userRes.data[0].password_hash !== hashPassword(old_password))
      return err('Eski şifre hatalı', 401, cors);
    await db('PATCH', 'users', { password_hash: hashPassword(new_password) }, `?id=eq.${result.user.id}`);
    await db('DELETE', 'sessions', null, `?user_id=eq.${result.user.id}&token=neq.${getToken()}`);
    return ok({ message: 'Şifre değiştirildi' }, 200, cors);
  }

  // ── ŞİFREMİ UNUTTUM ──
  if (path === '/forgot-password' && method === 'POST') {
    const rl = checkRateLimit(`forgot:${ip}`, 'forgot');
    if (rl.blocked) return err(`Çok fazla deneme.`, 429, cors);
    const email = sanitize(body.email || '');
    if (!email) return err('E-posta gerekli', 400, cors);
    const res = await db('GET', 'users', null, `?email=eq.${encodeURIComponent(email)}&select=id`);
    if (res.data && res.data[0]) {
      const code = Math.floor(100000 + Math.random()*900000).toString();
      const expiry = new Date(Date.now()+30*60*1000).toISOString();
      await db('PATCH', 'users', { reset_code:code, reset_expiry:expiry }, `?id=eq.${res.data[0].id}`);
      console.log(`RESET CODE [${email}]: ${code}`); // Admin Netlify logs'dan görür
    }
    return ok({ message: 'Kayıtlı e-posta ise sıfırlama kodu oluşturuldu. Yöneticinizle iletişime geçin.' }, 200, cors);
  }

  // ── ŞİFRE SIFIRLA ──
  if (path === '/reset-password' && method === 'POST') {
    const { email, code, new_password } = body;
    if (!email || !code || !new_password) return err('Eksik bilgi', 400, cors);
    if (new_password.length < 6) return err('Şifre en az 6 karakter', 400, cors);
    const res = await db('GET', 'users', null,
      `?email=eq.${encodeURIComponent(sanitize(email))}&select=id,reset_code,reset_expiry`);
    if (!res.data || !res.data[0]) return err('Geçersiz istek', 400, cors);
    const user = res.data[0];
    if (user.reset_code !== code) return err('Kod hatalı', 400, cors);
    if (!user.reset_expiry || new Date(user.reset_expiry) < new Date()) return err('Kodun süresi dolmuş', 400, cors);
    await db('PATCH', 'users', { password_hash:hashPassword(new_password), reset_code:null, reset_expiry:null }, `?id=eq.${user.id}`);
    await db('DELETE', 'sessions', null, `?user_id=eq.${user.id}`);
    return ok({ message: 'Şifre sıfırlandı!' }, 200, cors);
  }

  // ── KULLANIM LOGU ──
  if (path === '/log' && method === 'POST') {
    const result = await verifyUserSession(getToken());
    if (!result) return ok({ logged: false }, 200, cors);
    const { feature, duration } = body;
    if (feature) await db('POST', 'usage_logs', { user_id:result.user.id, feature, duration:duration||0 });
    return ok({ logged: true }, 200, cors);
  }

  return err('Endpoint bulunamadı', 404, cors);
};
