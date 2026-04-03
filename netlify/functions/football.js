// netlify/functions/football.js
const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RAPID_KEY   = process.env.RAPIDAPI_KEY || '';
const FB_KEY      = process.env.APIFOOTBALL_KEY || '';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

async function db(method, table, body, query) {
  const url = SUPABASE_URL + '/rest/v1/' + table + (query || '');
  const res = await fetch(url, {
    method,
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
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

async function apiFetch(path) {
  if (RAPID_KEY) {
    const r = await fetch('https://api-football-v1.p.rapidapi.com/v3' + path, {
      headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': 'api-football-v1.p.rapidapi.com' }
    });
    return r.json();
  }
  const r = await fetch('https://v3.football.api-sports.io' + path, { headers: { 'x-apisports-key': FB_KEY } });
  return r.json();
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  const token = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  if (!await verifyToken(token)) return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Oturum gerekli' }) };
  const path = (event.queryStringParameters && event.queryStringParameters.path) || '/fixtures?live=all';
  try {
    const data = await apiFetch(path);
    return { statusCode: 200, headers: CORS, body: JSON.stringify(data) };
  } catch(e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
