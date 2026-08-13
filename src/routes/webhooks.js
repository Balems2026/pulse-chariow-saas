const express = require("express");
const crypto = require("crypto");
const { pool } = require("../db");

const router = express.Router();

const SIGNATURE_HEADER = (process.env.WEBHOOK_SIGNATURE_HEADER || "x-chariow-signature").toLowerCase();
const PRO_CYCLE_DAYS = parseInt(process.env.PRO_CYCLE_DAYS || "30", 10);
const YEARLY_CYCLE_DAYS = 365;
const MONTHLY_PRODUCT_ID = process.env.CHARIOW_PRO_MONTHLY_PRODUCT_ID || "";
const YEARLY_PRODUCT_ID = process.env.CHARIOW_PRO_YEARLY_PRODUCT_ID || "";

// IMPORTANT : le nom exact de l'en-tête de signature et l'algorithme dépendent de la
// configuration de ton Pulse dans le tableau de bord Chariow. Vérifie-le là-bas et
// ajuste WEBHOOK_SIGNATURE_HEADER dans .env si besoin. Ce code suppose un HMAC-SHA256
// hexadécimal du corps brut de la requête, calculé avec CHARIOW_WEBHOOK_SECRET —
// c'est le standard le plus répandu (Stripe, GitHub, etc.) si Chariow ne précise pas autre chose.
function isValidSignature(rawBody, signature) {
  if (!process.env.CHARIOW_WEBHOOK_SECRET) return true; // pas de secret configuré = pas de vérification (déconseillé en prod)
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", process.env.CHARIOW_WEBHOOK_SECRET).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Cherche un e-mail client dans les formes de payload les plus courantes.
function extractEmail(payload) {
  return (
    payload?.data?.customer?.email ||
    payload?.data?.email ||
    payload?.customer?.email ||
    payload?.email ||
    null
  );
}

function extractEventId(payload) {
  return payload?.id || payload?.event_id || payload?.data?.id || null;
}

function extractEventType(payload) {
  return (payload?.event || payload?.type || "").toLowerCase();
}

// true si le montant/nom du produit indique un cycle annuel plutôt que mensuel.
function isYearlyPurchase(payload) {
  const productName = (payload?.data?.product?.name || payload?.data?.product_name || "").toLowerCase();
  return productName.includes("annuel") || productName.includes("yearly") || productName.includes("year");
}

router.post("/chariow", express.raw({ type: "*/*" }), async (req, res) => {
  const rawBody = req.body instanceof Buffer ? req.body.toString("utf8") : JSON.stringify(req.body);
  const signature = req.headers[SIGNATURE_HEADER];

  if (!isValidSignature(rawBody, signature)) {
    console.warn("Webhook Chariow rejeté : signature invalide.");
    return res.status(401).json({ error: "invalid_signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "invalid_json" });
  }

  const eventType = extractEventType(payload);
  const eventId = extractEventId(payload);

  // Idempotence : ignorer un événement déjà traité (Chariow peut renvoyer le même événement plusieurs fois).
  if (eventId) {
    try {
      await pool.query("INSERT INTO webhook_events (id) VALUES ($1)", [String(eventId)]);
    } catch {
      return res.status(200).json({ ok: true, note: "already_processed" });
    }
  }

  const productId = String(
    payload?.data?.product?.id ||
    payload?.data?.product_id ||
    payload?.product_id ||
    ""
  );

  // Si les IDs produits sont configurés, le webhook n'active que les offres Pro connues.
  const knownProductIds = [MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID].filter(Boolean);
  if (knownProductIds.length && (!productId || !knownProductIds.includes(productId))) {
    return res.status(200).json({ ok: true, note: "product_ignored" });
  }

  // On ne traite que les ventes finalisées / paiements reçus.
  const relevant = !eventType || /completed|paid|sale|purchase|r[ée]gl[ée]/.test(eventType);
  if (!relevant) return res.status(200).json({ ok: true, note: "event_ignored" });

  const email = extractEmail(payload);
  if (!email) {
    console.warn("Webhook Chariow sans e-mail exploitable :", JSON.stringify(payload).slice(0, 300));
    return res.status(200).json({ ok: true, note: "no_email_found" });
  }

  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  if (!rows.length) {
    // Le client a payé avant de créer un compte sur l'app, ou avec un e-mail différent.
    // Idée d'amélioration : lui envoyer un e-mail avec un lien pour créer son compte et récupérer son accès Pro.
    console.warn(`Webhook Chariow : aucun compte trouvé pour ${email}.`);
    return res.status(200).json({ ok: true, note: "user_not_found" });
  }

  const yearly = isYearlyPurchase(payload) || productId === YEARLY_PRODUCT_ID;
  const cycleDays = yearly ? YEARLY_CYCLE_DAYS : PRO_CYCLE_DAYS;
  const user = rows[0];
  const base = user.plan_expires_at && new Date(user.plan_expires_at) > new Date() ? new Date(user.plan_expires_at) : new Date();
  const newExpiry = new Date(base.getTime() + cycleDays * 24 * 60 * 60 * 1000);

  await pool.query(
    "UPDATE users SET plan = 'pro', plan_expires_at = $1, pro_activated_at = now(), pro_product_id = $2 WHERE id = $3",
    [newExpiry, productId || null, user.id]
  );
  console.log(`Abonnement Pro activé pour ${email} jusqu'au ${newExpiry.toISOString()}.`);

  res.status(200).json({ ok: true });
});

module.exports = router;
