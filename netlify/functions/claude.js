// netlify/functions/claude.js
const { getCORS, ok, err, opts, db } = require('./_security');
const CLAUDE_KEY = process.env.ANTHROPIC_KEY || '';

async function verifyAny(token) {
  if (!token) return null;
  if (token.startsWith('adm-')) {
    const res = await db('GET', 'admins', null, `?current_token=eq.${token}&select=id`);
    if (res.ok && res.data && res.data[0]) return { id: 'admin' };
    return null;
  }
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
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405, cors);
  if (!CLAUDE_KEY) return err('AI servisi yapılandırılmamış', 503, cors);

  const token = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  const user = await verifyAny(token);
  if (!user) return err('Oturum gerekli', 401, cors);

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: body.max_tokens || 1000,
        messages:   body.messages   || [],
      }),
    });
    const data = await res.json();
    return { statusCode: res.status, headers: cors, body: JSON.stringify(data) };
  } catch(e) {
    return err('AI hatası: ' + e.message, 500, cors);
  }
};
