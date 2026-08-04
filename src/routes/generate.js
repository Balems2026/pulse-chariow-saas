const express = require("express");
const rateLimit = require("express-rate-limit");
const { requireAuth } = require("../auth");
const { getUser, isPro, getUsageCount, incrementUsage, FREE_MONTHLY_QUOTA, currentPeriod } = require("../plan");

const router = express.Router();

// Anti-abus : 30 générations / 10 minutes / utilisateur, en plus du quota mensuel du plan Gratuit.
const limiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30, keyGenerator: (req) => String(req.userId) });

router.post("/", requireAuth, limiter, async (req, res) => {
  const { system, prompt } = req.body || {};
  if (!prompt || !prompt.trim()) {
    return res.status(400).json({ error: "missing_prompt", message: "Le champ prompt est requis." });
  }

  const user = await getUser(req.userId);
  if (!user) return res.status(404).json({ error: "not_found" });

  const pro = isPro(user);
  const period = currentPeriod();
  const used = await getUsageCount(user.id, period);

  if (!pro && used >= FREE_MONTHLY_QUOTA) {
    return res.status(402).json({
      error: "quota_exceeded",
      message: "Quota gratuit du mois atteint. Passez au plan Pro pour continuer.",
      used, quota: FREE_MONTHLY_QUOTA,
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        system: system || undefined,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Erreur API Claude:", response.status, errText);
      return res.status(502).json({ error: "upstream_error", message: "Erreur lors de la génération. Réessayez." });
    }

    const data = await response.json();
    const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("\n").trim();

    if (!pro) await incrementUsage(user.id, period);

    res.json({ text, used: pro ? null : used + 1, quota: FREE_MONTHLY_QUOTA, plan: pro ? "pro" : "free" });
  } catch (err) {
    console.error("Erreur proxy génération:", err);
    res.status(500).json({ error: "server_error", message: "Erreur serveur pendant la génération." });
  }
});

module.exports = router;
