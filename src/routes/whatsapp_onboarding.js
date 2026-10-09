const express = require('express');
const { requireAuth } = require('../auth');
const { pool } = require('../db');
const { getUser, effectivePlan, requirePlanFeature } = require('../plan');
const { encryptSecret } = require('../lib/secretBox');
const {
  exchangeEmbeddedSignupCode,
  getPhoneNumber,
  subscribeWaba,
  debugToken
} = require('../lib/meta');

const router = express.Router();

router.use(requireAuth, requirePlanFeature('whatsapp_agent'));

function requirePro(req, res, next) {
  getUser(req.userId)
    .then((u) => {
      if (!u) return res.status(401).json({ message: 'Session invalide.' });

      if (effectivePlan(u) === 'free') {
        return res.status(403).json({
          message: 'La connexion WhatsApp Business est réservée au plan Pro ou Business.'
        });
      }

      req.currentUser = u;
      next();
    })
    .catch(next);
}

/*
 * Meta Embedded Signup
 * L'utilisateur ne saisit jamais de token WhatsApp.
 * Le frontend envoie uniquement le code Meta et les identifiants
 * techniques retournés par Embedded Signup.
 */
router.post('/exchange', requireAuth, requirePro, async (req, res) => {
  const { code, wabaId, phoneNumberId } = req.body || {};

  if (!code || !wabaId || !phoneNumberId) {
    return res.status(400).json({
      message: 'Les informations de connexion Meta sont incomplètes.'
    });
  }

  try {
    const exchanged = await exchangeEmbeddedSignupCode(String(code));
    const accessToken = exchanged?.access_token;

    if (!accessToken) {
      return res.status(502).json({
        message: 'Meta n’a pas retourné le jeton d’intégration.'
      });
    }

    const phone = await getPhoneNumber(String(phoneNumberId), accessToken);

    await subscribeWaba(String(wabaId), accessToken);

    let tokenDebug = null;
    try {
      tokenDebug = await debugToken(accessToken);
    } catch (e) {
      console.warn('Meta debug_token:', e.message);
    }

    const encrypted = encryptSecret(accessToken);

    const { rows } = await pool.query(
      `
      INSERT INTO whatsapp_connections (
        user_id,
        waba_id,
        phone_number_id,
        access_token_enc,
        display_phone_number,
        business_name,
        connection_mode,
        meta_token_type,
        meta_status,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,
        'centralized',
        'business_integration_system_user',
        $7,
        NOW()
      )
      ON CONFLICT(user_id) DO UPDATE SET
        waba_id=EXCLUDED.waba_id,
        phone_number_id=EXCLUDED.phone_number_id,
        access_token_enc=EXCLUDED.access_token_enc,
        display_phone_number=EXCLUDED.display_phone_number,
        business_name=EXCLUDED.business_name,
        connection_mode='centralized',
        meta_token_type=EXCLUDED.meta_token_type,
        meta_status=EXCLUDED.meta_status,
        updated_at=NOW()
      RETURNING
        user_id,
        waba_id,
        phone_number_id,
        display_phone_number,
        business_name,
        connection_mode,
        meta_token_type,
        meta_status,
        ai_enabled,
        use_catalog,
        take_orders,
        answer_pricing,
        handoff_to_human,
        tone,
        greeting_message
      `,
      [
        req.userId,
        String(wabaId),
        String(phoneNumberId),
        encrypted,
        phone?.display_phone_number || null,
        phone?.verified_name || null,
        phone?.status || null
      ]
    );

    return res.json({
      ok: true,
      connection: {
        ...rows[0],
        connected: true
      },
      meta: {
        status: phone?.status || null,
        qualityRating: phone?.quality_rating || null,
        tokenScopes:
          tokenDebug?.data?.scopes ||
          tokenDebug?.data?.granular_scopes ||
          []
      }
    });
  } catch (e) {
    console.error(
      'whatsapp embedded signup exchange:',
      e.details || e
    );

    return res.status(e.status || 500).json({
      message:
        e.message ||
        'Impossible de connecter WhatsApp via Meta.',
      details: e.details || undefined
    });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        user_id,
        waba_id,
        phone_number_id,
        display_phone_number,
        business_name,
        connection_mode,
        meta_token_type,
        meta_status,
        ai_enabled,
        use_catalog,
        take_orders,
        answer_pricing,
        handoff_to_human,
        tone,
        greeting_message,
        updated_at
      FROM whatsapp_connections
      WHERE user_id=$1
      `,
      [req.userId]
    );

    return res.json({
      connection: rows[0]
        ? { ...rows[0], connected: true }
        : { connected: false }
    });
  } catch (e) {
    return res.status(500).json({
      message: 'Erreur serveur.'
    });
  }
});

module.exports = router;
