-- pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Kullanıcılar
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT,
  full_name     TEXT,
  password_hash TEXT NOT NULL,
  is_approved   BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  access_days   INTEGER DEFAULT 0,
  access_start  TIMESTAMPTZ,
  access_end    TIMESTAMPTZ,
  last_login    TIMESTAMPTZ,
  reset_code    TEXT,
  reset_expiry  TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Oturumlar
CREATE TABLE IF NOT EXISTS sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Admin
CREATE TABLE IF NOT EXISTS admins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  password_hash  TEXT NOT NULL,
  current_token  TEXT,
  token_expires  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Kullanım logları
CREATE TABLE IF NOT EXISTS usage_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL,
  duration   INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Canlı maçlar cache
CREATE TABLE IF NOT EXISTS live_matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id  BIGINT UNIQUE NOT NULL,
  home_team   TEXT,
  away_team   TEXT,
  league      TEXT,
  minute      INTEGER DEFAULT 0,
  score_home  INTEGER DEFAULT 0,
  score_away  INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'LIVE',
  home_stats  JSONB DEFAULT '{}',
  away_stats  JSONB DEFAULT '{}',
  home_signal JSONB DEFAULT '{}',
  away_signal JSONB DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- AI tahminler
CREATE TABLE IF NOT EXISTS match_predictions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id        BIGINT NOT NULL,
  home_team         TEXT,
  away_team         TEXT,
  league            TEXT,
  minute_predicted  INTEGER,
  score_at_predict  TEXT,
  predicted_result  TEXT,
  predicted_score   TEXT,
  ou_pred           TEXT,
  win_home_pct      INTEGER,
  draw_pct          INTEGER,
  win_away_pct      INTEGER,
  confidence        INTEGER,
  insight           TEXT,
  next_goal         TEXT,
  status            TEXT DEFAULT 'active',
  actual_score      TEXT,
  actual_result     TEXT,
  correct_result    BOOLEAN,
  correct_ou        BOOLEAN,
  finished_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- İndexler
CREATE INDEX IF NOT EXISTS idx_sessions_token   ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_user       ON usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_live_fixture     ON live_matches(fixture_id);
CREATE INDEX IF NOT EXISTS idx_pred_fixture     ON match_predictions(fixture_id);
CREATE INDEX IF NOT EXISTS idx_pred_status      ON match_predictions(status);
CREATE INDEX IF NOT EXISTS idx_pred_created     ON match_predictions(created_at);
