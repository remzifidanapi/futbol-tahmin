// netlify/functions/live.js
const { getCORS, ok, err, opts, db } = require('./_security');

async function verifyAny(token) {
  if (!token) return null;
  if (token.startsWith('adm-')) {
    const res = await db('GET', 'admins', null, `?current_token=eq.${token}&select=id`);
    if (res.ok && res.data && res.data[0]) return { id: 'admin', isAdmin: true };
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

  const token = (event.headers['authorization'] || '').replace('Bearer ', '').trim();
  const user = await verifyAny(token);
  if (!user) return err('Oturum gerekli', 401, cors);

  const path = (event.queryStringParameters && event.queryStringParameters.path) || '/matches';

  if (path === '/matches') {
    const res = await db('GET', 'live_matches', null,
      "?status=neq.FT&order=updated_at.desc&limit=100"
    );
    return ok({ matches: res.data || [], updated_at: new Date().toISOString() }, 200, cors);
  }

  if (path.startsWith('/predictions/')) {
    const fid = path.replace('/predictions/', '');
    const res = await db('GET', 'match_predictions', null,
      `?fixture_id=eq.${fid}&order=created_at.desc&limit=20`
    );
    return ok(res.data || [], 200, cors);
  }

  if (path === '/performance') {
    const weekAgo  = new Date(Date.now() - 7*24*60*60*1000).toISOString();
    const monthAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const today    = new Date().toISOString().slice(0,10);
    const [dRes, wRes, mRes] = await Promise.all([
      db('GET','match_predictions',null,`?created_at=gte.${today}T00:00:00Z&status=eq.finished&select=correct_result,correct_ou`),
      db('GET','match_predictions',null,`?created_at=gte.${weekAgo}&status=eq.finished&select=correct_result,correct_ou`),
      db('GET','match_predictions',null,`?created_at=gte.${monthAgo}&status=eq.finished&select=correct_result,correct_ou`),
    ]);
    const calc = (d) => {
      if (!d||!d.length) return {total:0,pct:0};
      return {total:d.length, pct:Math.round(d.filter(x=>x.correct_result).length/d.length*100)};
    };
    return ok({ today:calc(dRes.data), week:calc(wRes.data), month:calc(mRes.data) }, 200, cors);
  }

  return err('Endpoint bulunamadı', 404, cors);
};
