const express = require("express");
const { requireAuth } = require("../auth");

const router = express.Router();

router.get("/sales", requireAuth, async (req, res) => {
  try {
    const apiKey = process.env.CHARIOW_API_KEY;

    if (!apiKey) {
      console.error("CHARIOW_API_KEY n'est pas configurée.");
      return res.status(500).json({
        error: "chariow_not_configured",
        message: "L'API Chariow n'est pas configurée côté serveur."
      });
    }

    const status = req.query.status || "completed";
    const limit = req.query.limit || "100";

    const url =
      `https://api.chariow.com/v1/sales?status=${encodeURIComponent(status)}&limit=${encodeURIComponent(limit)}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json"
      }
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }

    if (!response.ok) {
      console.error("Erreur API Chariow :", response.status, data);

      return res.status(response.status).json({
        error: "chariow_api_error",
        status: response.status,
        details: data
      });
    }

    return res.json(data);
  } catch (error) {
    console.error("Erreur relais API Chariow :", error);

    return res.status(500).json({
      error: "chariow_proxy_error",
      message: "Impossible de contacter l'API Chariow."
    });
  }
});

module.exports = router;
