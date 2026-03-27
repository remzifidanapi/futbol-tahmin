// netlify/functions/scheduler.mjs
// Her 3 dakikada çalışır

export const config = { schedule: "*/3 * * * *" };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RAPID_KEY    = process.env.RAPIDAPI_KEY || '';
const FB_KEY       = process.env.APIFOOTBALL_KEY || '';
const CLAUDE_KEY   = process.env.ANTHROPIC_KEY || '';

async function db(method, table, body, query) {
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
  try { return { ok: res.ok, data: JSON.parse(text) }; } catch { return { ok: res.ok, data: text }; }
}

async function apiFetch(path) {
  if (RAPID_KEY) {
    const res = await fetch('https://api-football-v1.p.rapidapi.com/v3'+path, {
      headers: { 'x-rapidapi-key': RAPID_KEY, 'x-rapidapi-host': 'api-football-v1.p.rapidapi.com' }
    });
    return res.json();
  }
  if (FB_KEY) {
    const res = await fetch('https://v3.football.api-sports.io'+path, { headers: { 'x-apisports-key': FB_KEY } });
    return res.json();
  }
  return { response: [] };
}

function parseStat(stats, type) {
  if (!stats || !stats.length) return 0;
  const map = {
    'shots total': ['total shots','shots total','shots'],
    'shots on target': ['shots on goal','shots on target'],
    'corner kicks': ['corner kicks','corners'],
    'dangerous attacks': ['dangerous attacks'],
    'attacks': ['attacks'],
    'xg': ['expected goals','xg'],
    'ball possession': ['ball possession','possession'],
    'fouls': ['fouls'],
    'yellow cards': ['yellow cards'],
  };
  const search = map[type] || [type];
  for (const item of stats) {
    if (!item?.type) continue;
    const t = item.type.toLowerCase().replace(/_/g,' ').trim();
    if (search.some(s => t === s || t.includes(s))) {
      const n = parseFloat(String(item.value||0).replace('%',''));
      return isNaN(n) ? 0 : n;
    }
  }
  return 0;
}

function calcSignal(stats, minute) {
  const dAtk=stats.dAtk||0, sut=stats.sut||0, isb=stats.isb||0, kor=stats.kor||0, xg=stats.xg||0;
  const pressure = dAtk*0.4 + isb*0.3 + sut*0.2 + kor*0.1;
  const threat   = xg*0.6 + isb*0.25;
  const momentum = dAtk*0.5 + sut*0.3 + kor*0.2;
  const timeBoost = minute > 0 ? (minute/90)*(1+momentum/100) : 0.5;
  let score = (threat*0.4 + pressure*0.25 + momentum*0.2) * timeBoost;
  let prob  = score;
  if (dAtk>20 && isb<2) prob *= 0.6;
  if (sut>10  && xg<0.5) prob *= 0.75;
  if (isb===0) prob *= 0.7;
  score = Math.min(100, Math.round(score));
  prob  = Math.min(100, Math.round(prob));
  let decision = score>70 ? 'STRONG GOAL' : dAtk>=8&&sut>=3&&kor>=2 ? 'GOL GELİYOR' : score>50 ? 'WATCH' : 'LOW';
  return { goalScore:score, goalProb:prob, pressure:Math.round(pressure), momentum:Math.round(momentum), decision };
}

async function makeAIPrediction(match, hStats, aStats, minute) {
  if (!CLAUDE_KEY) return null;
  const home = match.teams.home.name, away = match.teams.away.name;
  const sh = match.goals.home||0, sa = match.goals.away||0;
  const prompt = `Futbol analiz. MAC:${home} vs ${away} ${minute}dk ${sh}-${sa}`
    + ` EV Sut:${hStats.sut} Isab:${hStats.isb} Kor:${hStats.kor} dAtk:${hStats.dAtk} xG:${hStats.xg}`
    + ` DEP Sut:${aStats.sut} Isab:${aStats.isb} Kor:${aStats.kor} dAtk:${aStats.dAtk} xG:${aStats.xg}`
    + ` JSON:{"win_home":N,"draw":N,"win_away":N,"best_score":"X-X","ou_pred":"UST/ALT","confidence":7,"insight":"analiz","next_goal":"HOME/AWAY/NONE"}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':CLAUDE_KEY,'anthropic-version':'2023-06-01'},
      body: JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:400, messages:[{role:'user',content:prompt}] }),
    });
    const d = await res.json();
    const txt = d.content.map(c=>c.text||'').join('');
    return JSON.parse(txt.replace(/```json|```/g,'').trim());
  } catch(e) { return null; }
}

async function checkFinishedMatches() {
  const pRes = await db('GET','match_predictions',null,'?status=eq.active&select=*&limit=30');
  if (!pRes.ok || !pRes.data) return;
  for (const pred of pRes.data) {
    try {
      const d = await apiFetch(`/fixtures?id=${pred.fixture_id}`);
      const fix = d.response && d.response[0];
      if (!fix) continue;
      const status = fix.fixture.status.short;
      if (['FT','AET','PEN'].includes(status)) {
        const sh=fix.goals.home||0, sa=fix.goals.away||0;
        const actual = sh>sa?'1':sh<sa?'2':'X';
        const ou = (sh+sa)>2.5;
        await db('PATCH','match_predictions',{
          status:'finished', actual_score:`${sh}-${sa}`, actual_result:actual,
          correct_result: pred.predicted_result===actual,
          correct_ou: (pred.ou_pred==='UST')===ou,
          finished_at: new Date().toISOString(),
        }, `?id=eq.${pred.id}`);
      }
    } catch(e) {}
  }
}

export default async function() {
  console.log('Scheduler', new Date().toISOString());
  await checkFinishedMatches();

  const matches = await apiFetch('/fixtures?live=all');
  const liveMatches = (matches.response||[]).slice(0,8); // Max 8 maç
  if (!liveMatches.length) { console.log('No live matches'); return; }

  for (const match of liveMatches) {
    const fid    = match.fixture.id;
    const minute = match.fixture.status.elapsed || 0;
    const sh=match.goals.home||0, sa=match.goals.away||0;

    let hStats={}, aStats={};
    try {
      const statD = await apiFetch(`/fixtures/statistics?fixture=${fid}`);
      const statR = statD.response||[];
      const hRaw  = statR[0]?.statistics||[], aRaw = statR[1]?.statistics||[];
      hStats = { sut:parseStat(hRaw,'shots total'), isb:parseStat(hRaw,'shots on target'),
                 kor:parseStat(hRaw,'corner kicks'), dAtk:parseStat(hRaw,'dangerous attacks'),
                 xg:parseStat(hRaw,'xg'), top:parseStat(hRaw,'ball possession'),
                 faul:parseStat(hRaw,'fouls'), sari:parseStat(hRaw,'yellow cards') };
      aStats = { sut:parseStat(aRaw,'shots total'), isb:parseStat(aRaw,'shots on target'),
                 kor:parseStat(aRaw,'corner kicks'), dAtk:parseStat(aRaw,'dangerous attacks'),
                 xg:parseStat(aRaw,'xg'), top:parseStat(aRaw,'ball possession'),
                 faul:parseStat(aRaw,'fouls'), sari:parseStat(aRaw,'yellow cards') };
    } catch(e) {}

    const hSignal = calcSignal(hStats, minute);
    const aSignal = calcSignal(aStats, minute);

    const matchData = {
      fixture_id:  fid,
      home_team:   match.teams.home.name,
      away_team:   match.teams.away.name,
      league:      match.league.name,
      minute, score_home:sh, score_away:sa,
      status:      match.fixture.status.short || 'LIVE',
      home_stats:  hStats, away_stats: aStats,
      home_signal: hSignal, away_signal: aSignal,
      updated_at:  new Date().toISOString(),
    };

    // Upsert
    const existing = await db('GET','live_matches',null,`?fixture_id=eq.${fid}&select=id`);
    if (existing.data && existing.data[0]) {
      await db('PATCH','live_matches',matchData,`?fixture_id=eq.${fid}`);
    } else {
      await db('POST','live_matches',matchData,'');
    }

    // AI tahmin (15 dk'da bir)
    if (minute > 0 && minute % 15 === 0) {
      const pred = await makeAIPrediction(match, hStats, aStats, minute);
      if (pred) {
        const predResult = pred.win_home>pred.win_away&&pred.win_home>pred.draw?'1':pred.win_away>pred.draw?'2':'X';
        await db('POST','match_predictions',{
          fixture_id:fid, home_team:match.teams.home.name, away_team:match.teams.away.name,
          league:match.league.name, minute_predicted:minute, score_at_predict:`${sh}-${sa}`,
          predicted_result:predResult, predicted_score:pred.best_score, ou_pred:pred.ou_pred,
          win_home_pct:pred.win_home, draw_pct:pred.draw, win_away_pct:pred.win_away,
          confidence:pred.confidence, insight:pred.insight, next_goal:pred.next_goal,
          status:'active', created_at:new Date().toISOString(),
        },'');
      }
    }
  }
  console.log('Scheduler done', liveMatches.length, 'matches processed');
}
