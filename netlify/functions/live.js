// netlify/functions/live.js
// Kullanıcılara Supabase cache'den veri sunar
const { getCORS, ok, err, opts, db, verifyUserSession } = require('./_security');

exports.handler = async function(event) {
  const origin = event.headers['origin'] || '';
  const cors = getCORS(origin);
  if (event.httpMethod === 'OPTIONS') return opts(cors);

  // Session doğrula
  const token = (event.headers['authorization'] || '').replace('Bearer ','').trim();
  const result = await verifyUserSession(token);
  if (!result) return err('Oturum gerekli', 401, cors);

  const path = (event.queryStringParameters && event.queryStringParameters.path) || '/matches';

  // Canlı maçlar
  if (path === '/matches') {
    const res = await db('GET','live_matches',null,'?status=neq.FT&order=updated_at.desc&limit=100');
    return ok({ matches: res.data||[], updated_at: new Date().toISOString() }, 200, cors);
  }

  // Maç tahminleri
  if (path.startsWith('/predictions/')) {
    const fid = path.replace('/predictions/','');
    const res = await db('GET','match_predictions',null,`?fixture_id=eq.${fid}&order=created_at.desc&limit=20`);
    return ok(res.data||[], 200, cors);
  }

  // Başarı istatistikleri (header için)
  if (path === '/performance') {
    const weekAgo = new Date(Date.now()-7*24*60*60*1000).toISOString();
    const monthAgo = new Date(Date.now()-30*24*60*60*1000).toISOString();
    const [dayRes, weekRes, monthRes] = await Promise.all([
      db('GET','match_predictions',null,`?created_at=gte.${new Date().toISOString().slice(0,10)}T00:00:00Z&status=eq.finished&select=correct_result,correct_ou`),
      db('GET','match_predictions',null,`?created_at=gte.${weekAgo}&status=eq.finished&select=correct_result,correct_ou`),
      db('GET','match_predictions',null,`?created_at=gte.${monthAgo}&status=eq.finished&select=correct_result,correct_ou`),
    ]);
    const calc = (data) => {
      if (!data || !data.length) return { total:0, pct:0 };
      const correct = data.filter(d=>d.correct_result).length;
      return { total:data.length, pct:Math.round(correct/data.length*100) };
    };
    return ok({
      today: calc(dayRes.data),
      week:  calc(weekRes.data),
      month: calc(monthRes.data),
    }, 200, cors);
  }

  return err('Endpoint bulunamadı', 404, cors);
};
