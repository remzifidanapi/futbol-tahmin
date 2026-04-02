// netlify/functions/admin.js
const {
  getCORS, checkRateLimit, hashPassword, generateToken,
  sanitize, ok, err, opts, db, verifyAdminSession,
} = require('./_security');

exports.handler = async function(event) {
  const origin = event.headers['origin'] || '';
  const cors = getCORS(origin);
  if (event.httpMethod === 'OPTIONS') return opts(cors);

  const ip = event.headers['x-forwarded-for'] || 'unknown';
  const rawPath = event.path || '/';
  const path = rawPath.replace('/.netlify/functions/admin','').replace('/api/admin','').replace(/\/$/,'') || '/';
  const method = event.httpMethod;
  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}
  const getToken = () => (event.headers['authorization'] || '').replace('Bearer ','').trim();

  // ── ADMIN GİRİŞ ── path /login veya boş, method POST, token yok
  const hasAuthHeader = !!(event.headers['authorization'] || '').replace('Bearer ','').trim();
  if (method === 'POST' && !hasAuthHeader && (path === '/login' || path === '' || path === '/')) {
    const rl = checkRateLimit(`adminlogin:${ip}`, 'admin_login');
    if (rl.blocked) return err(`Çok fazla deneme. ${rl.remaining} dk bekleyin.`, 429, cors);

    const email    = sanitize(body.email || '');
    const password = body.password || '';
    if (!email || !password) return err('E-posta ve şifre gerekli', 400, cors);

    const res = await db('GET', 'admins', null, `?email=eq.${encodeURIComponent(email)}&select=*`);
    if (!res.ok || !res.data || !res.data[0]) return err('Hatalı giriş bilgileri', 401, cors);

    const admin = res.data[0];
    if (admin.password_hash !== hashPassword(password)) return err('Hatalı giriş bilgileri', 401, cors);

    const token   = generateToken('adm');
    const expires = new Date(Date.now() + 24*60*60*1000).toISOString();
    await db('PATCH', 'admins', { current_token:token, token_expires:expires }, `?id=eq.${admin.id}`);

    return ok({ token, admin: { email:admin.email, id:admin.id } }, 200, cors);
  }

  // ── TOKEN DOĞRULA ──
  const adminData = await verifyAdminSession(getToken());
  if (!adminData) return err('Admin yetkisi gerekli', 401, cors);

  // ── KULLANICILAR ──
  if ((path === '/users' || path === '' || path === '/') && method === 'GET') {
    const res = await db('GET', 'users', null,
      '?select=id,email,phone,full_name,is_approved,is_active,access_days,access_start,access_end,last_login,created_at,notes&order=created_at.desc'
    );
    if (!res.ok) return err('Kullanıcılar alınamadı', 500, cors);
    const users = (res.data||[]).map(u => {
      const daysLeft = u.access_end
        ? Math.max(0, Math.ceil((new Date(u.access_end)-new Date())/(1000*60*60*24)))
        : null;
      return { ...u, days_left: daysLeft };
    });
    return ok(users, 200, cors);
  }

  // ── STATS ──
  if (path === '/stats' && method === 'GET') {
    const [uRes, lRes, pRes] = await Promise.all([
      db('GET', 'users', null, '?select=id,is_approved,is_active,access_end'),
      db('GET', 'usage_logs', null, '?select=feature,duration&limit=1000'),
      db('GET', 'match_predictions', null, '?select=correct_result,correct_ou&status=eq.finished&limit=500'),
    ]);
    const users = uRes.data||[], logs = lRes.data||[], preds = pRes.data||[];
    const now = new Date();
    const stats = {
      total_users:   users.length,
      approved:      users.filter(u=>u.is_approved).length,
      pending:       users.filter(u=>!u.is_approved).length,
      active:        users.filter(u=>u.is_active&&u.is_approved&&(!u.access_end||new Date(u.access_end)>now)).length,
      expired:       users.filter(u=>u.access_end&&new Date(u.access_end)<now).length,
      suspended:     users.filter(u=>!u.is_active).length,
      total_actions: logs.length,
      accuracy_pct:  preds.length ? Math.round(preds.filter(p=>p.correct_result).length/preds.length*100) : 0,
      popular_features: {},
    };
    logs.forEach(l => { stats.popular_features[l.feature] = (stats.popular_features[l.feature]||0)+1; });
    return ok(stats, 200, cors);
  }

  // ── ONAYLA ──
  const approveM = path.match(/^\/users\/([^/]+)\/approve$/);
  if (approveM && method === 'POST') {
    const days = parseInt(body.days)||0;
    if (days < 1) return err('Gün sayısı gerekli', 400, cors);
    const start = new Date(), end = new Date(start.getTime()+days*24*60*60*1000);
    await db('PATCH','users',{is_approved:true,is_active:true,access_days:days,access_start:start.toISOString(),access_end:end.toISOString()},`?id=eq.${approveM[1]}`);
    return ok({ message:`${days} gün erişim verildi`, access_end:end.toISOString() }, 200, cors);
  }

  // ── UZAT ──
  const extendM = path.match(/^\/users\/([^/]+)\/extend$/);
  if (extendM && method === 'POST') {
    const days = parseInt(body.days)||0;
    if (days < 1) return err('Gün sayısı gerekli', 400, cors);
    const uRes = await db('GET','users',null,`?id=eq.${extendM[1]}&select=access_end`);
    const base = uRes.data&&uRes.data[0]&&uRes.data[0].access_end ? new Date(uRes.data[0].access_end) : new Date();
    const newEnd = new Date(Math.max(base.getTime(),Date.now())+days*24*60*60*1000);
    await db('PATCH','users',{is_approved:true,is_active:true,access_end:newEnd.toISOString()},`?id=eq.${extendM[1]}`);
    return ok({ message:`${days} gün eklendi`, new_access_end:newEnd.toISOString() }, 200, cors);
  }

  // ── ENGELLE/AÇ ──
  const toggleM = path.match(/^\/users\/([^/]+)\/toggle$/);
  if (toggleM && method === 'POST') {
    await db('PATCH','users',{is_active:body.is_active},`?id=eq.${toggleM[1]}`);
    if (!body.is_active) await db('DELETE','sessions',null,`?user_id=eq.${toggleM[1]}`);
    return ok({ message: body.is_active?'Erişim açıldı':'Erişim engellendi' }, 200, cors);
  }

  // ── NOT ──
  const noteM = path.match(/^\/users\/([^/]+)\/note$/);
  if (noteM && method === 'POST') {
    await db('PATCH','users',{notes:sanitize(body.notes||'')},`?id=eq.${noteM[1]}`);
    return ok({ message:'Not kaydedildi' }, 200, cors);
  }

  // ── KULLANIM STATS ──
  const statsM = path.match(/^\/users\/([^/]+)\/stats$/);
  if (statsM && method === 'GET') {
    const lRes = await db('GET','usage_logs',null,`?user_id=eq.${statsM[1]}&select=feature,duration,created_at&order=created_at.desc&limit=200`);
    const logs = lRes.data||[];
    const fc={}, fd={};
    let td=0;
    logs.forEach(l=>{ fc[l.feature]=(fc[l.feature]||0)+1; fd[l.feature]=(fd[l.feature]||0)+(l.duration||0); td+=l.duration||0; });
    return ok({ total_sessions:logs.length, total_duration:td, feature_counts:fc, feature_duration:fd, recent_logs:logs.slice(0,20) }, 200, cors);
  }

  // ── SİL ──
  const deleteM = path.match(/^\/users\/([^/]+)$/);
  if (deleteM && method === 'DELETE') {
    const uid = deleteM[1];
    await Promise.all([
      db('DELETE','sessions',null,`?user_id=eq.${uid}`),
      db('DELETE','usage_logs',null,`?user_id=eq.${uid}`),
      db('DELETE','users',null,`?id=eq.${uid}`),
    ]);
    return ok({ message:'Kullanıcı silindi' }, 200, cors);
  }

  // ── RAPOR ──
  if (path === '/report' && method === 'GET') {
    const yesterday = new Date(Date.now()-86400000).toISOString();
    const pRes = await db('GET','match_predictions',null,
      `?created_at=gte.${yesterday}&status=eq.finished&select=*&limit=500`
    );
    const preds = pRes.data||[];
    const correct = preds.filter(p=>p.correct_result);
    const correctOU = preds.filter(p=>p.correct_ou);
    const leagueStats = {};
    preds.forEach(p=>{
      if(!leagueStats[p.league]) leagueStats[p.league]={total:0,correct:0};
      leagueStats[p.league].total++;
      if(p.correct_result) leagueStats[p.league].correct++;
    });
    return ok({
      date: new Date().toLocaleDateString('tr-TR'),
      total_predictions: preds.length,
      correct_results:   correct.length,
      correct_ou:        correctOU.length,
      accuracy_pct:      preds.length ? Math.round(correct.length/preds.length*100) : 0,
      ou_accuracy_pct:   preds.length ? Math.round(correctOU.length/preds.length*100) : 0,
      league_stats:      leagueStats,
      predictions:       preds.slice(0,100),
    }, 200, cors);
  }

  return err('Endpoint bulunamadı: '+path, 404, cors);
};
