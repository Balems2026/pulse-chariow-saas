const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("../auth");
const {
  getUser,
  isPro,
  getQuota,
  getUsageCount,
  incrementUsage,
  currentPeriod,
} = require("../plan");

const router = express.Router();

const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  keyGenerator: (req) => String(req.userId),
  standardHeaders: true,
  legacyHeaders: false,
});

const PRO_FEATURES = new Set([
  "campaign",
  "followup_sequence",
  "sales_argument",
  "conversation_analysis",
  "prospect_profile",
  "prospecting_script",
  "template",
  "stats",
]);

const FEATURE_INSTRUCTIONS = {
  campaign: "Crée une campagne WhatsApp commerciale complète en plusieurs messages, avec objectif, audience, proposition de valeur, objections et appels à l'action.",
  followup_sequence: "Crée une séquence de relance commerciale structurée (J+1, J+3, J+7), naturelle, non agressive et orientée conversion.",
  sales_argument: "Construis un argumentaire commercial complet : caractéristiques, bénéfices, preuves à mettre en avant, objections probables, réponses aux objections et appel à l'action.",
  conversation_analysis: "Analyse la conversation fournie. Identifie l'intention du prospect, son niveau d'intérêt, l'objection principale, les signaux d'achat et propose la meilleure réponse suivante.",
  prospect_profile: "Adapte la réponse au profil du prospect indiqué. Explique brièvement l'approche commerciale retenue et produis le message final.",
  prospecting_script: "Génère un script de prospection professionnel et naturel adapté au canal et à la cible indiqués, avec ouverture, découverte, proposition, traitement des objections et conclusion.",
  template: "Crée un modèle commercial réutilisable, clair et facilement personnalisable avec des variables entre crochets.",
};

function normalizeFeature(value) {
  return String(value || "basic").trim().toLowerCase();
}

router.post("/", requireAuth, limiter, async (req, res) => {
  const { system, prompt, feature = "basic" } = req.body || {};
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: "missing_prompt", message: "Le champ prompt est requis." });
  }

  const user = await getUser(req.userId);
  if (!user) return res.status(404).json({ error: "not_found" });

  const pro = isPro(user);
  const selectedFeature = normalizeFeature(feature);

  if (PRO_FEATURES.has(selectedFeature) && !pro) {
    return res.status(403).json({
      error: "pro_feature_required",
      message: "Cette fonctionnalité est réservée aux utilisateurs Pro.",
      feature: selectedFeature,
      upgradeRequired: true,
    });
  }

  const period = currentPeriod();
  const used = await getUsageCount(user.id, period);
  const quota = getQuota(user);

  if (used >= quota) {
    return res.status(402).json({
      error: "quota_exceeded",
      message: pro
        ? "Votre quota Pro du mois est atteint."
        : "Quota gratuit du mois atteint. Passez au plan Pro pour continuer.",
      used,
      quota,
      plan: pro ? "pro" : "free",
      upgradeRequired: !pro,
    });
  }

  const featureInstruction = FEATURE_INSTRUCTIONS[selectedFeature];
  const finalSystem = [
    system || "Tu es WhatsBiz Pro AI, un assistant commercial spécialisé dans la vente conversationnelle.",
    "Réponds en français sauf demande contraire. Sois concret, professionnel et orienté vers l'action. N'invente pas de preuves, prix, garanties ou résultats non fournis.",
    pro ? "Utilisateur Pro : tu peux exploiter les capacités commerciales avancées demandées." : "Utilisateur Free : reste sur les capacités commerciales de base.",
    featureInstruction || "Génère une réponse commerciale utile, concise et directement exploitable.",
  ].join("\n\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
        max_tokens: pro ? 1800 : 1000,
        system: finalSystem,
        messages: [{ role: "user", content: String(prompt).trim() }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erreur API Claude:", response.status, errText);
      return res.status(502).json({ error: "upstream_error", message: "Erreur lors de la génération. Réessayez." });
    }

    const data = await response.json();
    const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("\n").trim();
    const newUsed = await incrementUsage(user.id, period);

    res.json({
      text,
      feature: selectedFeature,
      used: newUsed,
      quota,
      remaining: Math.max(0, quota - newUsed),
      plan: pro ? "pro" : "free",
      planExpiresAt: user.plan_expires_at,
    });
  } catch (err) {
    console.error("Erreur proxy génération:", err);
    res.status(500).json({ error: "server_error", message: "Erreur serveur pendant la génération." });
  }
});

module.exports = router;
