// netlify/functions/football.js
const { getCORS, checkRateLimit, ok, err, opts, db } = require('./_security');

const RAPID_KEY = process.env.RAPIDAPI_KEY || '';
const FB_KEY    = process.env.APIFOOTBALL_KEY || '';

async function apiFetch(path) {
  if (RAPID_KEY) {
    const res = await fetch('https://api-football-v1.p.rapidapi.com/v3' + path, {
      headers: {
        'x-rapidapi-key':  RAPID_KEY,
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
      }
    });
    return res.json();
  }
  if (FB_KEY) {
    const res = await fetch('https://v3.football.api-sports.io' + path, {
      headers: { 'x-apisports-key': FB_KEY }
    });
    return res.json();
  }
  throw new Error('API anahtarı yapılandırılmamış');
}

async function verifyAny(token) {
  if (!token) return null;
  // Admin token kontrolü
  if (token.startsWith('adm-')) {
    const res = await db('GET', 'admins', null, `?current_token=eq.${token}&select=id`);
    if (res.ok && res.data && res.data[0]) return { id: 'admin', isAdmin: true };
    return null;
  }
  // User token kontrolü
  const res = await db('GET', 'sessions', null,
    `?token=eq.${token}&expires_at=gt.${new Date().toISOString()}&select=user_id,users(is_active,is_approved,access_end)`
  );
  if (!res.ok || !res.data || !res.data[0]) return null;
  const u = res.data[0].users;
  if (!u || !u.is_active || !u.is_approved) return null;
  if (u.access_end && new Date(u.access_end) < new Date()) return null;
  return { id: res.data[0].user_id };
}

exports.handler = async function(event) {
  const origin = event.headers['origin'] || '';
  const cors = getCORS(origin);
  if (event.httpMethod === 'OPTIONS') return opts(cors);

  const token = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  const user = await verifyAny(token);
  if (!user) return err('Oturum gerekli', 401, cors);

  const rl = checkRateLimit(`api:${user.id}`, 'api');
  if (rl.blocked) return err('API limiti aşıldı', 429, cors);

  const path = (event.queryStringParameters && event.queryStringParameters.path)
    ? event.queryStringParameters.path
    : '/fixtures?live=all';

  try {
    const data = await apiFetch(path);
    return { statusCode: 200, headers: cors, body: JSON.stringify(data) };
  } catch(e) {
    return err('API hatası: ' + e.message, 500, cors);
  }
};
