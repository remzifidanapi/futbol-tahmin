// netlify/functions/football.js
// API-Football proxy — key sunucuda, kullanıcı görmez
const { getCORS, checkRateLimit, ok, err, opts, verifyUserSession } = require('./_security');

const RAPID_KEY = process.env.RAPIDAPI_KEY || '';
const FB_KEY    = process.env.APIFOOTBALL_KEY || '';

async function apiFetch(path) {
  if (RAPID_KEY) {
    const url = 'https://api-football-v1.p.rapidapi.com/v3' + path;
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key':  RAPID_KEY,
        'x-rapidapi-host': 'api-football-v1.p.rapidapi.com',
      }
    });
    return res.json();
  }
  if (FB_KEY) {
    const url = 'https://v3.football.api-sports.io' + path;
    const res = await fetch(url, { headers: { 'x-apisports-key': FB_KEY } });
    return res.json();
  }
  throw new Error('API anahtarı yapılandırılmamış');
}

exports.handler = async function(event) {
  const origin = event.headers['origin'] || '';
  const cors = getCORS(origin);
  if (event.httpMethod === 'OPTIONS') return opts(cors);

  // Session doğrula
  const token = (event.headers['authorization'] || '').replace('Bearer ','').trim();
  const result = await verifyUserSession(token);
  if (!result) return err('Oturum gerekli', 401, cors);

  // Rate limit
  const rl = checkRateLimit(`api:${result.user.id}`, 'api');
  if (rl.blocked) return err('API limiti aşıldı', 429, cors);

  const path = event.queryStringParameters && event.queryStringParameters.path
    ? event.queryStringParameters.path
    : '/fixtures?live=all';

  try {
    const data = await apiFetch(path);
    return { statusCode: 200, headers: cors, body: JSON.stringify(data) };
  } catch(e) {
    return err('API hatası: ' + e.message, 500, cors);
  }
};
