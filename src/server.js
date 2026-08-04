require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { initSchema } = require("./db");

const authRoutes = require("./routes/auth");
const generateRoutes = require("./routes/generate");
const webhookRoutes = require("./routes/webhooks");

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN === "*" ? true : process.env.CORS_ORIGIN?.split(",") }));

// Le webhook Chariow a besoin du corps brut pour la vérification de signature,
// donc sa route est montée AVANT express.json() et gère elle-même le parsing.
app.use("/api/webhooks", webhookRoutes);

app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoutes);
app.use("/api/generate", generateRoutes);

const PORT = process.env.PORT || 3000;

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`AI Sales Cameroun backend en écoute sur le port ${PORT}`));
  })
  .catch((err) => {
    console.error("Impossible d'initialiser la base de données :", err);
    process.exit(1);
  });
