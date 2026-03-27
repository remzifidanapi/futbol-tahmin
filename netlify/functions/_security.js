// netlify/functions/_security.js
// Tüm fonksiyonlar bu modülü kullanır

const crypto = require('crypto');

// ── CORS ──────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://oddsproapp.com',
  'https://www.oddsproapp.com',
  'http://localhost:3000', // dev
];

function getCORS(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
}

// ── IN-MEMORY RATE LIMITER ────────────────────────
const rateLimits = {};
const RATE_WINDOW = 15 * 60 * 1000; // 15 dakika
const RATE_LIMITS = {
  login:        5,   // 15dk'da 5 giriş denemesi
  register:     3,   // 15dk'da 3 kayıt
  forgot:       3,   // 15dk'da 3 şifre sıfırlama
  api:          100, // 15dk'da 100 API isteği
  admin_login:  5,   // 15dk'da 5 admin giriş
};

function checkRateLimit(key, type) {
  const limit = RATE_LIMITS[type] || RATE_LIMITS.api;
  const now = Date.now();
  if (!rateLimits[key]) rateLimits[key] = { count: 0, resetAt: now + RATE_WINDOW };
  if (now > rateLimits[key].resetAt) { rateLimits[key] = { count: 0, resetAt: now + RATE_WINDOW }; }
  rateLimits[key].count++;
  if (rateLimits[key].count > limit) {
    const remaining = Math.ceil((rateLimits[key].resetAt - now) / 60000);
    return { blocked: true, remaining };
  }
  return { blocked: false };
}

// ── ŞIFRE HASH ────────────────────────────────────
function hashPassword(password) {
  const salt = process.env.PASSWORD_SALT || 'futbolTahmin2025';
  return crypto.createHash('sha256').update(password + salt).digest('hex');
}

// ── TOKEN ─────────────────────────────────────────
function generateToken(prefix) {
  const token = crypto.randomBytes(32).toString('hex');
  return prefix ? prefix + '-' + token : token;
}

// ── INPUT TEMİZLE (XSS) ──────────────────────────
function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[<>'"]/g, function(c) {
    return {'<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];
  }).trim().slice(0, 500);
}

// ── EMAIL VALIDATE ────────────────────────────────
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── YANIT YARDIMCILARI ────────────────────────────
function ok(data, status, headers) {
  return { statusCode: status||200, headers: Object.assign({}, headers||{}, {'Content-Type':'application/json'}), body: JSON.stringify(data) };
}

function err(msg, status, headers) {
  return { statusCode: status||400, headers: Object.assign({}, headers||{}, {'Content-Type':'application/json'}), body: JSON.stringify({ error: msg }) };
}

function opts(headers) {
  return { statusCode: 200, headers: headers||{}, body: '' };
}

// ── SUPABASE ──────────────────────────────────────
async function db(method, table, body, query) {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase config eksik');

  const url = `${SUPABASE_URL}/rest/v1/${table}${query||''}`;
  const res = await fetch(url, {
    method,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

// ── SESSION DOĞRULA ───────────────────────────────
async function verifyUserSession(token) {
  if (!token) return null;
  const res = await db('GET', 'sessions', null,
    `?token=eq.${token}&expires_at=gt.${new Date().toISOString()}&select=*,users(*)`
  );
  if (!res.ok || !res.data || !res.data[0]) return null;
  const user = res.data[0].users;
  if (!user || !user.is_active || !user.is_approved) return null;
  if (user.access_end && new Date(user.access_end) < new Date()) return null;
  return { session: res.data[0], user };
}

async function verifyAdminSession(token) {
  if (!token || !token.startsWith('adm-')) return null;
  const res = await db('GET', 'admins', null,
    `?current_token=eq.${token}&select=id,email,token_expires`
  );
  if (!res.ok || !res.data || !res.data[0]) return null;
  const admin = res.data[0];
  if (admin.token_expires && new Date(admin.token_expires) < new Date()) return null;
  return admin;
}

module.exports = {
  getCORS, checkRateLimit, hashPassword, generateToken,
  sanitize, isValidEmail, ok, err, opts, db,
  verifyUserSession, verifyAdminSession,
};
