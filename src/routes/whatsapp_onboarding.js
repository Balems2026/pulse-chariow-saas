const express = require('express');
const { requireAuth } = require('../auth');
const { pool } = require('../db');
const { getUser,effectivePlan } = require('../plan');
const { encryptSecret } = require('../lib/secretBox');
const { exchangeEmbeddedSignupCode, getPhoneNumber, subscribeWaba, debugToken } = require('../lib/meta');
const router = express.Router();
const { requirePlanFeature } = require('../plan');
router.use(requireAuth, requirePlanFeature('whatsapp_agent'));

function requirePro(req, res, next) {
  getUser(req.userId).then(u => {
    if (!u) return res.status(401).json({ message: 'Session invalide.' });
    if (effectivePlan(u) === 'free') {
      return res.status(403).json({ message: 'La connexion WhatsApp Business est réservée au plan Pro ou Business.' });
    }
    req.currentUser = u; next();
  }).catch(next);
}

async function resolvePhoneNumberId(wabaId, accessToken) {
  const graphVersion = String(process.env.META_GRAPH_API_VERSION || 'v25.0').trim();
  const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,status&limit=100`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || 'Meta n’a pas permis de récupérer le numéro WhatsApp associé au compte.';
    const error = new Error(message);
    error.status = response.status >= 400 && response.status < 500 ? 422 : 502;
    throw error;
  }
  const numbers = Array.isArray(payload?.data) ? payload.data : [];
  if (numbers.length === 1 && numbers[0]?.id) return String(numbers[0].id);
  if (numbers.length === 0) {
    const error = new Error('Meta a transmis le compte WhatsApp, mais aucun numéro accessible n’a été trouvé. Vérifiez les autorisations WhatsApp de la configuration Embedded Signup.');
    error.status = 422;
    throw error;
  }
  const error = new Error('Meta a transmis plusieurs numéros pour ce compte sans préciser lequel a été connecté. Relancez la connexion pour transmettre l’identifiant du numéro.');
  error.status = 422;
  throw error;
}

router.post('/exchange', requireAuth, requirePro, async (req, res) => {
  const { code, wabaId } = req.body || {};
  let { phoneNumberId } = req.body || {};
  if (!code || !wabaId) return res.status(400).json({ message: 'Code Meta et WABA ID sont requis.' });
  try {
    const exchanged = await exchangeEmbeddedSignupCode(String(code));
    const accessToken = exchanged?.access_token;
    if (!accessToken) return res.status(502).json({ message: 'Meta n’a pas retourné de jeton d’intégration.' });
    // Le parcours de coexistence peut ne renvoyer que waba_id. Si le compte ne
    // contient qu’un numéro accessible, récupère son ID côté serveur avec le jeton.
    if (!phoneNumberId) phoneNumberId = await resolvePhoneNumberId(String(wabaId), accessToken);
    const phone = await getPhoneNumber(String(phoneNumberId), accessToken);
    await subscribeWaba(String(wabaId), accessToken);
    let tokenDebug = null;
    try { tokenDebug = await debugToken(accessToken); } catch (e) { console.warn('Meta debug_token:', e.message); }
    const encrypted = encryptSecret(accessToken);
    const { rows } = await pool.query(`
      INSERT INTO whatsapp_connections(user_id,waba_id,phone_number_id,access_token_enc,display_phone_number,business_name,connection_mode,meta_token_type,meta_status,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,'centralized','business_integration_system_user',$7,NOW())
      ON CONFLICT(user_id) DO UPDATE SET waba_id=EXCLUDED.waba_id,phone_number_id=EXCLUDED.phone_number_id,access_token_enc=EXCLUDED.access_token_enc,display_phone_number=EXCLUDED.display_phone_number,business_name=EXCLUDED.business_name,connection_mode='centralized',meta_token_type=EXCLUDED.meta_token_type,meta_status=EXCLUDED.meta_status,updated_at=NOW()
      RETURNING user_id,waba_id,phone_number_id,display_phone_number,business_name,connection_mode,meta_token_type,meta_status,ai_enabled,use_catalog,take_orders,answer_pricing,handoff_to_human,tone,greeting_message`,
      [req.userId,String(wabaId),String(phoneNumberId),encrypted,phone?.display_phone_number||null,phone?.verified_name||null,phone?.status||null]);
    res.json({ ok: true, connection: { ...rows[0], connected: true }, meta: { status: phone?.status || null, qualityRating: phone?.quality_rating || null, tokenScopes: tokenDebug?.data?.scopes || tokenDebug?.data?.granular_scopes || [] } });
  } catch (e) {
    console.error('whatsapp embedded signup exchange:', e.details || e);
    res.status(e.status || 500).json({ message: e.message || 'Impossible de connecter WhatsApp via Meta.', details: e.details || undefined });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT user_id,waba_id,phone_number_id,display_phone_number,business_name,connection_mode,meta_token_type,meta_status,ai_enabled,use_catalog,take_orders,answer_pricing,handoff_to_human,tone,greeting_message,updated_at FROM whatsapp_connections WHERE user_id=$1`, [req.userId]);
    res.json({ connection: rows[0] ? { ...rows[0], connected: true } : { connected: false } });
  } catch (e) { res.status(500).json({ message: 'Erreur serveur.' }); }
});

module.exports = router;
