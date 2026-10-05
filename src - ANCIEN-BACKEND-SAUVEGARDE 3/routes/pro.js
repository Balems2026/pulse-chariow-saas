const express = require("express");
const { requireAuth } = require("../auth");
const { getUser, isPro, getQuota, getUsageCount, currentPeriod } = require("../plan");

const router = express.Router();

const FEATURES = [
  { id: "campaign", name: "Générateur de campagnes WhatsApp", plan: "pro" },
  { id: "followup_sequence", name: "Séquences de relance", plan: "pro" },
  { id: "sales_argument", name: "Argumentaires de vente", plan: "pro" },
  { id: "conversation_analysis", name: "Analyse de conversation client", plan: "pro" },
  { id: "prospect_profile", name: "Réponses selon le profil du prospect", plan: "pro" },
  { id: "prospecting_script", name: "Scripts de prospection", plan: "pro" },
  { id: "template", name: "Bibliothèque de modèles commerciaux", plan: "pro" },
  { id: "stats", name: "Statistiques d'utilisation", plan: "pro" },
];

router.get("/features", requireAuth, async (req, res) => {
  const user = await getUser(req.userId);
  if (!user) return res.status(404).json({ error: "not_found" });
  const pro = isPro(user);
  res.json({
    plan: pro ? "pro" : "free",
    features: FEATURES.map((f) => ({ ...f, available: pro })),
  });
});

router.get("/stats", requireAuth, async (req, res) => {
  const user = await getUser(req.userId);
  if (!user) return res.status(404).json({ error: "not_found" });
  if (!isPro(user)) {
    return res.status(403).json({ error: "pro_feature_required", message: "Les statistiques avancées sont réservées au plan Pro." });
  }
  const period = currentPeriod();
  const used = await getUsageCount(user.id, period);
  const quota = getQuota(user);
  res.json({
    plan: "pro",
    period,
    used,
    quota,
    remaining: Math.max(0, quota - used),
    utilizationPercent: quota ? Math.round((used / quota) * 100) : 0,
    planExpiresAt: user.plan_expires_at,
  });
});

module.exports = router;
