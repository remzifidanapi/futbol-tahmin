// get-settings.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  const keys = (event.queryStringParameters?.keys || '').split(',').filter(Boolean);
  let query = supabase.from('site_ayarlari').select('anahtar,deger');
  if (keys.length) query = query.in('anahtar', keys);
  const { data, error } = await query;
  if (error) return res(500, { error: error.message });
  const result = {};
  (data || []).forEach(d => result[d.anahtar] = d.deger);
  return res(200, result);
};
function res(status, body) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) };
}
