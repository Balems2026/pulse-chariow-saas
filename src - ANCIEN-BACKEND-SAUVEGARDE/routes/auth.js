const express = require("express");
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { signToken, requireAuth } = require("../auth");
const { summarize, getUser } = require("../plan");

const router = express.Router();

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || "");
}

router.post("/register", async (req, res) => {
  const { email, password } = req.body || {};
  if (!validEmail(email)) return res.status(400).json({ error: "invalid_email", message: "E-mail invalide." });
  if (!password || password.length < 8) {
    return res.status(400).json({ error: "weak_password", message: "Le mot de passe doit contenir au moins 8 caractères." });
  }

  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase()]);
  if (existing.rows.length) {
    return res.status(409).json({ error: "email_taken", message: "Un compte existe déjà avec cet e-mail." });
  }

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *",
    [email.toLowerCase(), hash]
  );
  const user = rows[0];
  const token = signToken(user);
  res.json({ token, user: await summarize(user) });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [(email || "").toLowerCase()]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: "invalid_credentials", message: "E-mail ou mot de passe incorrect." });

  const ok = await bcrypt.compare(password || "", user.password_hash);
  if (!ok) return res.status(401).json({ error: "invalid_credentials", message: "E-mail ou mot de passe incorrect." });

  const token = signToken(user);
  res.json({ token, user: await summarize(user) });
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await getUser(req.userId);
  if (!user) return res.status(404).json({ error: "not_found" });
  res.json({ user: await summarize(user) });
});

module.exports = router;
