// netlify/functions/claude.js
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const CLAUDE_KEY   = process.env.ANTHROPIC_KEY || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

async function db(method, table, body, query) {
  const url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  const res = await fetch(url, {
    method,
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try { return { ok: res.ok, data: JSON.parse(text) }; } catch { return { ok: false, data: text }; }
}

async function verifyToken(token) {
  if (!token) return false;
  if (token.startsWith('adm-')) {
    const r = await db('GET', 'admins', null, '?current_token=eq.' + token + '&select=id');
    return r.ok && r.data && r.data[0];
  }
  const r = await db('GET', 'sessions', null, '?token=eq.' + token + '&expires_at=gt.' + new Date().toISOString() + '&select=user_id,users(is_active,is_approved,access_end)');
  if (!r.ok || !r.data || !r.data[0]) return false;
  const u = r.data[0].users;
  if (!u || !u.is_active || !u.is_approved) return false;
  if (u.access_end && new Date(u.access_end) < new Date()) return false;
  return true;
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  const token = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!await verifyToken(token)) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Oturum gerekli' }) };
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: body.max_tokens || 800, messages: body.messages || [] }),
    });
    const data = await r.json();
    return { statusCode: r.status, headers: CORS, body: JSON.stringify(data) };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
