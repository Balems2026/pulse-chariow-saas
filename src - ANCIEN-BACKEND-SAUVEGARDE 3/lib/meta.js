const GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v25.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function graph(path, { method = 'GET', token, body, query } = {}) {
  const url = new URL(`${GRAPH_BASE}/${String(path).replace(/^\//, '')}`);
  if (query) Object.entries(query).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.set(k, String(v)); });
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Meta Graph API HTTP ${res.status}`);
    err.status = res.status; err.details = data;
    throw err;
  }
  return data;
}

async function exchangeEmbeddedSignupCode(code) {
  const appId = (process.env.META_APP_ID || '').trim();
  const appSecret = (process.env.META_APP_SECRET || '').trim();
  if (!appId || !appSecret) throw new Error('META_APP_ID et META_APP_SECRET doivent être configurés.');
  const query = { client_id: appId, client_secret: appSecret, code };
  if ((process.env.META_REDIRECT_URI || '').trim()) query.redirect_uri = process.env.META_REDIRECT_URI.trim();
  return graph('/oauth/access_token', { method: 'POST', query });
}

async function getPhoneNumber(phoneNumberId, token) {
  return graph(`/${phoneNumberId}`, { token, query: { fields: 'id,display_phone_number,verified_name,quality_rating,status' } });
}

async function subscribeWaba(wabaId, token) {
  return graph(`/${wabaId}/subscribed_apps`, { method: 'POST', token });
}

async function getPhoneNumbers(wabaId, token) {
  return graph(`/${wabaId}/phone_numbers`, { token });
}

async function debugToken(token) {
  const appId = (process.env.META_APP_ID || '').trim();
  const appSecret = (process.env.META_APP_SECRET || '').trim();
  return graph('/debug_token', { token: `${appId}|${appSecret}`, query: { input_token: token } });
}

async function sendText(phoneNumberId, to, text, token) {
  return graph(`/${phoneNumberId}/messages`, { method: 'POST', token, body: {
    messaging_product: 'whatsapp', to: String(to).replace(/\D/g, ''), type: 'text', text: { body: String(text) }
  }});
}

module.exports = { GRAPH_VERSION, graph, exchangeEmbeddedSignupCode, getPhoneNumber, subscribeWaba, getPhoneNumbers, debugToken, sendText };
