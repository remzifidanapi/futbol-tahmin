// public/js/core.js — Tüm sayfalarda yüklenir

// ── AUTH ────────────────────────────────────────
var AUTH = {
  token: localStorage.getItem('ft_token') || '',
  user:  JSON.parse(localStorage.getItem('ft_user') || 'null'),
  _lastActivity: Date.now(),
  _timeout: null,
  IDLE_TIMEOUT: 10 * 60 * 1000, // 10 dakika

  save: function(token, user) {
    this.token = token; this.user = user;
    localStorage.setItem('ft_token', token);
    localStorage.setItem('ft_user', JSON.stringify(user));
  },
  clear: function() {
    this.token = ''; this.user = null;
    localStorage.removeItem('ft_token');
    localStorage.removeItem('ft_user');
  },
  headers: function() {
    return { 'Content-Type':'application/json', 'Authorization':'Bearer '+this.token };
  },
  // Aktivite takip — 10dk hareketsizlikte logout
  resetTimer: function() {
    this._lastActivity = Date.now();
    clearTimeout(this._timeout);
    if (this.token) {
      this._timeout = setTimeout(function() {
        AUTH.clear();
        Toast.show('Oturum süreniz doldu. Lütfen tekrar giriş yapın.', 'warn');
        setTimeout(function(){ window.location.href = '/giris'; }, 2000);
      }, this.IDLE_TIMEOUT);
    }
  },
  startIdleTimer: function() {
    var self = this;
    ['click','keypress','touchstart','scroll'].forEach(function(e) {
      document.addEventListener(e, function() { self.resetTimer(); }, { passive: true });
    });
    this.resetTimer();
  },
  verify: async function() {
    if (!this.token) return false;
    try {
      var r = await fetch('/api/auth/verify', { headers: this.headers() });
      var d = await r.json();
      if (d.user) { this.user = d.user; localStorage.setItem('ft_user', JSON.stringify(d.user)); return true; }
      this.clear(); return false;
    } catch(e) { return false; }
  },
  logout: async function() {
    try { await fetch('/api/auth/logout', { method:'POST', headers: this.headers() }); } catch(e) {}
    this.clear();
    window.location.href = '/giris';
  },
};

// ── API ÇAĞRI YARDIMCISI ──────────────────────────
var API = {
  football: async function(path) {
    var r = await fetch('/api/football?path=' + encodeURIComponent(path), { headers: AUTH.headers() });
    return r.json();
  },
  ai: async function(messages, maxTokens) {
    var r = await fetch('/api/ai', {
      method:'POST', headers: AUTH.headers(),
      body: JSON.stringify({ messages, max_tokens: maxTokens || 800 }),
    });
    return r.json();
  },
  live: async function(path) {
    var r = await fetch('/api/live?path=' + encodeURIComponent(path || '/matches'), { headers: AUTH.headers() });
    return r.json();
  },
  auth: async function(path, method, body) {
    var opts = { method: method || 'GET', headers: AUTH.headers() };
    if (body) opts.body = JSON.stringify(body);
    var r = await fetch('/api/auth' + path, opts);
    return r.json();
  },
};

// ── TOAST ────────────────────────────────────────
var Toast = {
  _wrap: null,
  _get: function() {
    if (!this._wrap) {
      this._wrap = document.createElement('div');
      this._wrap.className = 'toast-wrap';
      document.body.appendChild(this._wrap);
    }
    return this._wrap;
  },
  show: function(msg, type) {
    var t = document.createElement('div');
    t.className = 'toast toast-' + (type || 'ok');
    t.textContent = msg;
    this._get().appendChild(t);
    setTimeout(function() {
      t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; t.style.transition = '.3s';
      setTimeout(function() { t.remove(); }, 300);
    }, 2800);
  },
};

// ── MESAJ ────────────────────────────────────────
function showMsg(id, text, type) {
  var el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = 'msg show-' + (type || 'info');
}
function hideMsg(id) {
  var el = document.getElementById(id);
  if (el) { el.className = 'msg'; el.textContent = ''; }
}

// ── BUTON YÜKLENİYOR ────────────────────────────
function btnLoad(id, loading, text) {
  var btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) { btn.dataset.orig = btn.innerHTML; btn.innerHTML = '<span class="spin"></span>' + (text||''); }
  else { btn.innerHTML = btn.dataset.orig || text || 'Tamam'; }
}

// ── TARIH FORMAT ─────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'2-digit' });
}

// ── SINYAL MOTORU ────────────────────────────────
var Signal = {
  calc: function(stats, minute) {
    var dAtk=stats.dAtk||0, sut=stats.sut||0, isb=stats.isb||0, kor=stats.kor||0, xg=stats.xg||0;
    var pressure = dAtk*0.4 + isb*0.3 + sut*0.2 + kor*0.1;
    var threat   = xg*0.6 + isb*0.25;
    var momentum = dAtk*0.5 + sut*0.3 + kor*0.2;
    var tBoost   = minute>0 ? (minute/90)*(1+momentum/100) : 0.5;
    var score    = (threat*0.4 + pressure*0.25 + momentum*0.2) * tBoost;
    var prob     = score;
    if (dAtk>20&&isb<2) prob*=0.6;
    if (sut>10&&xg<0.5) prob*=0.75;
    if (isb===0) prob*=0.7;
    score = Math.min(100,Math.round(score));
    prob  = Math.min(100,Math.round(prob));
    var dec = score>70?'STRONG GOAL':dAtk>=8&&sut>=3&&kor>=2?'GOL GELİYOR':score>50?'WATCH':'LOW';
    return { goalScore:score, goalProb:prob, pressure:Math.round(pressure), momentum:Math.round(momentum), decision:dec };
  },
  badge: function(decision) {
    var map = {
      'STRONG GOAL': '<span class="sig sig-strong">🔴 STRONG GOAL</span>',
      'GOL GELİYOR': '<span class="sig sig-goal">🔥 GOL GELİYOR</span>',
      'WATCH':       '<span class="sig sig-watch">🟡 WATCH</span>',
      'LOW':         '<span class="sig sig-low">🟢 LOW</span>',
    };
    return map[decision] || map['LOW'];
  },
};

// ── STAT PARSE ───────────────────────────────────
function parseStat(stats, type) {
  if (!stats||!stats.length) return 0;
  var aliases = {
    'shots total':['total shots','shots total','shots'],
    'shots on target':['shots on goal','shots on target','on target'],
    'corner kicks':['corner kicks','corners'],
    'dangerous attacks':['dangerous attacks'],
    'attacks':['attacks'],
    'xg':['expected goals','xg','expected_goals'],
    'ball possession':['ball possession','possession'],
    'fouls':['fouls','total fouls'],
    'yellow cards':['yellow cards'],
    'red cards':['red cards'],
    'offsides':['offsides','offside'],
    'blocked shots':['blocked shots','shots blocked'],
    'goalkeeper saves':['goalkeeper saves','saves'],
    'crosses':['crosses','total crosses'],
    'shots inside box':['shots insidebox','shots inside box'],
  };
  var search = aliases[type.toLowerCase()] || [type.toLowerCase()];
  for (var i=0; i<stats.length; i++) {
    var item = stats[i];
    if (!item||!item.type) continue;
    var t = item.type.toLowerCase().replace(/_/g,' ').trim();
    for (var j=0; j<search.length; j++) {
      if (t===search[j]||t.indexOf(search[j])!==-1) {
        if (item.value===null||item.value===undefined) return 0;
        var n = parseFloat(String(item.value).replace('%','').trim());
        return isNaN(n)?0:n;
      }
    }
  }
  return 0;
}
