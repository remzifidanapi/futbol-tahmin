// netlify/functions/approve.js
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  const admin = verifyToken(event);
  if (!admin || admin.rol !== 'superadmin') return res(401, { error: 'Yetkisiz' });

  try {
    const { id, uyelik_bitis_tarihi, notlar, otomatik_telegram } = JSON.parse(event.body);

    const { error } = await supabase.from('applications').update({
      durum: 'onaylandi',
      uyelik_bitis_tarihi: uyelik_bitis_tarihi || null,
      notlar: notlar || null,
      updated_at: new Date().toISOString()
    }).eq('id', id);

    if (error) return res(500, { error: error.message });

    let telegram_gonderildi = false;

    if (otomatik_telegram) {
      // Kullanıcı telegram bilgisini al
      const { data: app } = await supabase.from('applications').select('telegram,ad,soyad').eq('id', id).single();
      // Bot ayarlarını al
      const { data: ayarlar } = await supabase.from('site_ayarlari')
        .select('anahtar,deger').in('anahtar', ['telegram_bot_token', 'telegram_grup_linki']);

      const ayarMap = {};
      (ayarlar || []).forEach(a => ayarMap[a.anahtar] = a.deger);

      if (ayarMap.telegram_bot_token && app?.telegram) {
        const telegramUser = app.telegram.replace('@', '');
        // Telegram bot üzerinden mesaj gönder
        try {
          const tgRes = await fetch(`https://api.telegram.org/bot${ayarMap.telegram_bot_token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: '@' + telegramUser,
              text: `✅ Merhaba ${app.ad}!\n\nAnalizhane üyelik başvurunuz onaylandı! 🎉\n\nGruba katılmak için aşağıdaki linke tıklayın:\n${ayarMap.telegram_grup_linki || 'https://t.me/analizhane'}\n\n📅 Üyelik bitiş tarihi: ${uyelik_bitis_tarihi || 'Belirtilmedi'}\n\nAnalizhane Yönetimi`,
              parse_mode: 'HTML'
            })
          });
          if (tgRes.ok) {
            telegram_gonderildi = true;
            await supabase.from('applications').update({ telegram_davet_gonderildi: true }).eq('id', id);
          }
        } catch(e) { /* telegram hatası sessizce geç */ }
      }
    }

    return res(200, { success: true, telegram_gonderildi });
  } catch (e) {
    return res(500, { error: e.message });
  }
};

function verifyToken(event) {
  try {
    const auth = event.headers.authorization || '';
    const token = auth.replace('Bearer ', '');
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch { return null; }
}

function res(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}
