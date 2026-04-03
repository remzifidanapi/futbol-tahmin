// netlify/functions/admin.js
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const PASSWORD_SALT = process.env.PASSWORD_SALT || 'futbolTahmin2025';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};

function ok(data)        { return { statusCode: 200, headers: CORS, body: JSON.stringify(data) }; }
function err(msg, code)  { return { statusCode: code||400, headers: CORS, body: JSON.stringify({ error: msg }) }; }
function opts()          { return { statusCode: 200, headers: CORS, body: '' }; }
function hash(pw)        { return crypto.createHash('sha256').update(pw + PASSWORD_SALT).digest('hex'); }
function token()         { return 'adm-' + crypto.randomBytes(32).toString('hex'); }

async function db(method, table, body, query) {
  const url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  const res = await fetch(url, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, data: text }; }
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return opts();

  const method = event.httpMethod;
  const rawPath = event.path || '/';
  const path = rawPath.replace('/.netlify/functions/admin', '').replace('/api/admin', '') || '/';

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  const authHeader = (event.headers['authorization'] || event.headers['Authorization'] || '');
  const adminToken = authHeader.replace('Bearer ', '').trim();

  // ── LOGIN ──
  if (method === 'POST' && body.email && body.password && !adminToken) {
    const { email, password } = body;
    const res = await db('GET', 'admins', null, '?email=eq.' + encodeURIComponent(email) + '&select=*');
    if (!res.ok || !res.data || !res.data[0]) return err('Hatalı giriş bilgileri', 401);
    const admin = res.data[0];
    if (admin.password_hash !== hash(password)) return err('Hatalı giriş bilgileri', 401);
    const tok = token();
    const exp = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await db('PATCH', 'admins', { current_token: tok, token_expires: exp }, '?id=eq.' + admin.id);
    return ok({ token: tok, admin: { email: admin.email } });
  }

  // ── TOKEN DOĞRULA ──
  if (!adminToken || !adminToken.startsWith('adm-')) return err('Yetkisiz', 401);
  const aRes = await db('GET', 'admins', null, '?current_token=eq.' + adminToken + '&select=id,email,token_expires');
  if (!aRes.ok || !aRes.data || !aRes.data[0]) return err('Oturum geçersiz', 401);
  if (new Date(aRes.data[0].token_expires) < new Date()) return err('Oturum süresi doldu', 401);

  // ── KULLANICILAR ──
  if (path === '/users' && method === 'GET') {
    const res = await db('GET', 'users', null,
      '?select=id,email,phone,full_name,is_approved,is_active,access_days,access_end,last_login,created_at,notes&order=created_at.desc'
    );
    const now = new Date();
    const users = (res.data || []).map(u => ({
      ...u,
      days_left: u.access_end ? Math.max(0, Math.ceil((new Date(u.access_end) - now) / 86400000)) : null
    }));
    return ok(users);
  }

  // ── STATS ──
  if (path === '/stats' && method === 'GET') {
    const [uRes, lRes] = await Promise.all([
      db('GET', 'users', null, '?select=id,is_approved,is_active,access_end'),
      db('GET', 'usage_logs', null, '?select=feature&limit=1000'),
    ]);
    const users = uRes.data || [], logs = lRes.data || [], now = new Date();
    return ok({
      total_users: users.length,
      active: users.filter(u => u.is_active && u.is_approved && (!u.access_end || new Date(u.access_end) > now)).length,
      pending: users.filter(u => !u.is_approved).length,
      suspended: users.filter(u => !u.is_active).length,
      expired: users.filter(u => u.access_end && new Date(u.access_end) < now).length,
      total_actions: logs.length,
    });
  }

  // ── ONAYLA ──
  const approveM = path.match(/^\/users\/([^/]+)\/approve$/);
  if (approveM && method === 'POST') {
    const days = parseInt(body.days) || 0;
    if (!days) return err('Gün sayısı gerekli');
    const end = new Date(Date.now() + days * 86400000);
    await db('PATCH', 'users', { is_approved: true, is_active: true, access_days: days, access_end: end.toISOString() }, '?id=eq.' + approveM[1]);
    return ok({ message: days + ' gün erişim verildi' });
  }

  // ── UZAT ──
  const extendM = path.match(/^\/users\/([^/]+)\/extend$/);
  if (extendM && method === 'POST') {
    const days = parseInt(body.days) || 0;
    if (!days) return err('Gün sayısı gerekli');
    const uRes = await db('GET', 'users', null, '?id=eq.' + extendM[1] + '&select=access_end');
    const base = uRes.data && uRes.data[0] && uRes.data[0].access_end ? new Date(uRes.data[0].access_end) : new Date();
    const end = new Date(Math.max(base.getTime(), Date.now()) + days * 86400000);
    await db('PATCH', 'users', { is_approved: true, is_active: true, access_end: end.toISOString() }, '?id=eq.' + extendM[1]);
    return ok({ message: days + ' gün eklendi' });
  }

  // ── TOGGLE ──
  const toggleM = path.match(/^\/users\/([^/]+)\/toggle$/);
  if (toggleM && method === 'POST') {
    await db('PATCH', 'users', { is_active: body.is_active }, '?id=eq.' + toggleM[1]);
    if (!body.is_active) await db('DELETE', 'sessions', null, '?user_id=eq.' + toggleM[1]);
    return ok({ message: body.is_active ? 'Açıldı' : 'Engellendi' });
  }

  // ── NOT ──
  const noteM = path.match(/^\/users\/([^/]+)\/note$/);
  if (noteM && method === 'POST') {
    await db('PATCH', 'users', { notes: body.notes || '' }, '?id=eq.' + noteM[1]);
    return ok({ message: 'Not kaydedildi' });
  }

  // ── KULLANIM STATS ──
  const statsM = path.match(/^\/users\/([^/]+)\/stats$/);
  if (statsM && method === 'GET') {
    const lRes = await db('GET', 'usage_logs', null, '?user_id=eq.' + statsM[1] + '&select=feature,duration,created_at&order=created_at.desc&limit=200');
    const logs = lRes.data || [];
    const fc = {}, fd = {};
    let td = 0;
    logs.forEach(l => { fc[l.feature] = (fc[l.feature] || 0) + 1; fd[l.feature] = (fd[l.feature] || 0) + (l.duration || 0); td += l.duration || 0; });
    return ok({ total_sessions: logs.length, total_duration: td, feature_counts: fc, recent_logs: logs.slice(0, 20) });
  }

  // ── SİL ──
  const deleteM = path.match(/^\/users\/([^/]+)$/);
  if (deleteM && method === 'DELETE') {
    await Promise.all([
      db('DELETE', 'sessions', null, '?user_id=eq.' + deleteM[1]),
      db('DELETE', 'usage_logs', null, '?user_id=eq.' + deleteM[1]),
      db('DELETE', 'users', null, '?id=eq.' + deleteM[1]),
    ]);
    return ok({ message: 'Silindi' });
  }

  // ── ŞİFRE KODLARI ──
  if (path === '/reset-codes' && method === 'GET') {
    const res = await db('GET', 'users', null, '?reset_code=not.is.null&select=email,full_name,reset_code,reset_expiry&order=reset_expiry.desc');
    return ok(res.data || []);
  }

  // ── CANLI MAÇLAR ──
  if (path === '/live' && method === 'GET') {
    const res = await db('GET', 'live_matches', null, '?order=updated_at.desc&limit=50');
    return ok(res.data || []);
  }

  // ── RAPOR ──
  if (path === '/report' && method === 'GET') {
    const ago = new Date(Date.now() - 86400000).toISOString();
    const pRes = await db('GET', 'match_predictions', null, '?created_at=gte.' + ago + '&status=eq.finished&select=*&limit=200');
    const preds = pRes.data || [];
    const correct = preds.filter(p => p.correct_result).length;
    const correctOU = preds.filter(p => p.correct_ou).length;
    const leagues = {};
    preds.forEach(p => {
      if (!leagues[p.league]) leagues[p.league] = { total: 0, correct: 0 };
      leagues[p.league].total++;
      if (p.correct_result) leagues[p.league].correct++;
    });
    return ok({
      date: new Date().toLocaleDateString('tr-TR'),
      total: preds.length,
      correct,
      correct_ou: correctOU,
      accuracy: preds.length ? Math.round(correct / preds.length * 100) : 0,
      ou_accuracy: preds.length ? Math.round(correctOU / preds.length * 100) : 0,
      leagues,
      predictions: preds.slice(0, 50),
    });
  }

  return err('Endpoint bulunamadı: ' + path, 404);
};
