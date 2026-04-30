-- ANALİZHANE v4 - Final Şema
DROP TABLE IF EXISTS tahminler CASCADE;
DROP TABLE IF EXISTS applications CASCADE;
DROP TABLE IF EXISTS site_ayarlari CASCADE;
DROP TABLE IF EXISTS admins CASCADE;

CREATE TABLE admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  isim TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'superadmin')),
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE applications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ad TEXT NOT NULL,
  soyad TEXT NOT NULL,
  email_sifrelenmis TEXT,
  email_hash TEXT UNIQUE,
  telefon_sifrelenmis TEXT,
  sifre_hash TEXT,
  telegram TEXT NOT NULL,
  referans_admin_id UUID REFERENCES admins(id),
  referans_admin_isim TEXT,
  bayi_kodu TEXT NOT NULL,
  gorsel_url TEXT,
  durum TEXT DEFAULT 'beklemede' CHECK (durum IN ('beklemede', 'onaylandi', 'reddedildi')),
  uyelik_bitis_tarihi DATE,
  telegram_davet_gonderildi BOOLEAN DEFAULT false,
  notlar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tahminler (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES admins(id),
  admin_isim TEXT NOT NULL,
  baslik TEXT NOT NULL,
  icerik TEXT,
  gorsel_url TEXT,
  tip TEXT DEFAULT 'yazili' CHECK (tip IN ('yazili', 'gorsel', 'aciklama')),
  mac_tarihi DATE,
  aktif BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE site_ayarlari (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  anahtar TEXT UNIQUE NOT NULL,
  deger TEXT,
  guncelleme_tarihi TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO site_ayarlari (anahtar, deger) VALUES
('banner_url',''),('banner_link',''),('banner_aktif','false'),
('uyelik_sartlari','<h3>Üyelik Şartları</h3><p>1. iddaa.com üzerinden bayi kodunu girmen zorunludur.<br>2. Bayi değişimi sonrası ekran görüntüsü iletilmelidir.<br>3. Paylaşılan analizler yatırım tavsiyesi değildir.</p>'),
('telegram_grup_linki','https://t.me/analizhane'),
('bayi_kodu','303527'),('bayi_adi','Mehmet Mustafa Donma'),
('telegram_bot_token',''),('telegram_chat_id','');

ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tahminler ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_ayarlari ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tahminleri herkes okur" ON tahminler FOR SELECT USING (aktif = true);
CREATE POLICY "Herkes basvuru ekler" ON applications FOR INSERT WITH CHECK (true);
CREATE POLICY "Site ayarlari herkes okur" ON site_ayarlari FOR SELECT USING (true);
CREATE POLICY "Aktif adminler gorunur" ON admins FOR SELECT USING (aktif = true);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER applications_updated_at BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tahminler_updated_at BEFORE UPDATE ON tahminler FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO admins (username, password_hash, isim, rol) VALUES ('superadmin', '$2b$10$kVkax.nkfOjD.heQG8EdeOrNwHPn5MjeHnZ9Itj8WdNIl68Y7m1UK', 'Süper Admin', 'superadmin');
INSERT INTO admins (username, password_hash, isim, rol) VALUES ('admin1', '$2b$10$fztEGNfogDUZ.X2teN1lKeJurAU0TFJZk3pysnMU69ByAY2fx3kD2', 'Admin 1', 'admin');
INSERT INTO admins (username, password_hash, isim, rol) VALUES ('admin2', '$2b$10$8s8v81ciLojQTIVHpy0l9e8lRFlj069nbre6yP/.UUIt0YAC7Ut5G', 'Admin 2', 'admin');
INSERT INTO admins (username, password_hash, isim, rol) VALUES ('admin3', '$2b$10$aAdkNMyyqZ4DxZ9ZAHHXVeTLkFa0dIWXVEwnISFp8bu7KA8pQiewa', 'Admin 3', 'admin');
INSERT INTO admins (username, password_hash, isim, rol) VALUES ('admin4', '$2b$10$N71jZrt0FB66jmXzVzPnhe6tR5MR8pSRRc1ectdSjN/UScgCx3Hdq', 'Admin 4', 'admin');
INSERT INTO admins (username, password_hash, isim, rol) VALUES ('admin5', '$2b$10$Zds63ZAlyrL9I1ZisfE4EOVvneRvLeRjMTUSibsY2plDAo0Mo6/Y.', 'Admin 5', 'admin');
INSERT INTO admins (username, password_hash, isim, rol) VALUES ('admin6', '$2b$10$L3VLFPk55IS8fMcZH.YZK.NO7ChxJF7502cwTGtnFdktZiKpW0eJy', 'Admin 6', 'admin');
