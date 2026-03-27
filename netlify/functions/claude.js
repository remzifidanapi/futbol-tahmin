// netlify/functions/claude.js
// Claude AI proxy — key sunucuda
const { getCORS, checkRateLimit, ok, err, opts, verifyUserSession } = require('./_security');

const CLAUDE_KEY = process.env.ANTHROPIC_KEY || '';

exports.handler = async function(event) {
  const origin = event.headers['origin'] || '';
  const cors = getCORS(origin);
  if (event.httpMethod === 'OPTIONS') return opts(cors);
  if (event.httpMethod !== 'POST') return err('Method not allowed', 405, cors);

  if (!CLAUDE_KEY) return err('AI servisi yapılandırılmamış', 503, cors);

  // Session doğrula
  const token = (event.headers['authorization'] || '').replace('Bearer ','').trim();
  const result = await verifyUserSession(token);
  if (!result) return err('Oturum gerekli', 401, cors);

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       CLAUDE_KEY,
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
