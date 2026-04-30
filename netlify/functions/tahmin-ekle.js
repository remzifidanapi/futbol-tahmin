// tahmin-ekle.js
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const Busboy = require('busboy');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return res(405, { error: 'Method not allowed' });
  const admin = verifyToken(event);
  if (!admin) return res(401, { error: 'Yetkisiz' });
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

  try {
    const { fields, files } = await parseForm(event);
    const { baslik, icerik, tip, mac_tarihi, admin_id } = fields;
    if (!baslik) return res(400, { error: 'Başlık gerekli' });
    if (admin.id !== admin_id && admin.rol !== 'superadmin') return res(403, { error: 'Yetki hatası' });

    // Admin bilgisi
    const { data: adminData } = await supabase.from('admins').select('isim').eq('id', admin_id).single();

    let gorsel_url = null;
    if (files.gorsel) {
      const ext = files.gorsel.filename.split('.').pop().toLowerCase();
      const filename = `tahminler/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('analizhane-uploads')
        .upload(filename, Buffer.from(files.gorsel.data, 'base64'), { contentType: files.gorsel.mimetype });
      if (!uploadErr) {
        const { data: urlData } = supabase.storage.from('analizhane-uploads').getPublicUrl(filename);
        gorsel_url = urlData.publicUrl;
      }
    }

    const { error } = await supabase.from('tahminler').insert({
      admin_id, admin_isim: adminData?.isim || admin.isim,
      baslik: baslik.trim(), icerik: icerik || null,
      gorsel_url, tip: tip || 'yazili',
      mac_tarihi: mac_tarihi || null, aktif: true
    });

    if (error) return res(500, { error: error.message });
    return res(200, { success: true });
  } catch(e) { return res(500, { error: e.message }); }
};

function parseForm(event) {
  return new Promise((resolve, reject) => {
    const fields = {}, files = {};
    const busboy = Busboy({ headers: { 'content-type': event.headers['content-type'] } });
    busboy.on('field', (name, val) => fields[name] = val);
    busboy.on('file', (name, file, info) => {
      const chunks = [];
      file.on('data', d => chunks.push(d));
      file.on('end', () => {
        files[name] = { data: Buffer.concat(chunks).toString('base64'), filename: info.filename, mimetype: info.mimeType };
      });
    });
    busboy.on('finish', () => resolve({ fields, files }));
    busboy.on('error', reject);
    busboy.write(Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8'));
    busboy.end();
  });
}
function verifyToken(event) {
  try { return jwt.verify((event.headers.authorization||'').replace('Bearer ',''), process.env.JWT_SECRET); }
  catch { return null; }
}
function res(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}
