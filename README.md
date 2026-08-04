# AI Sales Cameroun — Backend

Backend minimal pour transformer l'app en vrai SaaS multi-utilisateurs :
- Comptes utilisateurs (inscription / connexion par e-mail + mot de passe)
- Quota gratuit mensuel appliqué côté serveur (impossible à contourner depuis le navigateur)
- Proxy vers Claude : ta clé API Anthropic reste secrète, jamais exposée au client
- Webhook Chariow (« Pulse ») qui active automatiquement le plan Pro après paiement

## 1. Déployer

Le plus simple : [Railway](https://railway.app) ou [Render](https://render.com).

1. Crée un nouveau projet, connecte ce dossier (ou pousse-le sur GitHub puis connecte le repo).
2. Ajoute une base **PostgreSQL** (Railway et Render en proposent une gratuite/peu chère en un clic).
3. Renseigne les variables d'environnement du fichier `.env.example` dans les réglages du service :
   - `DATABASE_URL` — fournie automatiquement si tu ajoutes le module Postgres de Railway/Render
   - `JWT_SECRET` — génère une valeur aléatoire (`openssl rand -hex 32`)
   - `ANTHROPIC_API_KEY` — ta clé depuis [console.anthropic.com](https://console.anthropic.com)
   - `CHARIOW_WEBHOOK_SECRET` — voir étape 3 ci-dessous
   - `CORS_ORIGIN` — l'URL où sera hébergé le frontend (ou `*` en attendant)
4. Commande de démarrage : `npm start`

Le serveur crée automatiquement les tables nécessaires au premier démarrage.

## 2. Connecter le frontend

Dans le fichier `ai-sales-cameroun.jsx`, remplace la constante `BACKEND_URL` par l'URL de ton service déployé
(ex. `https://ai-sales-cameroun-backend.up.railway.app`).

## 3. Configurer le Pulse (webhook) Chariow

1. Dans ton tableau de bord Chariow, crée un produit "Abonnement Pro — mensuel" et un autre "— annuel"
   (utilise le mot "annuel"/"yearly" dans le nom pour que le backend distingue automatiquement le cycle).
2. Récupère les liens de paiement de ces produits et colle-les dans `CHARIOW_PRO_MONTHLY_URL` /
   `CHARIOW_PRO_YEARLY_URL` du frontend.
3. Va dans la section Pulses/Webhooks de Chariow, crée un Pulse déclenché sur "Vente finalisée" /
   "Paiement reçu", pointant vers : `https://TON-BACKEND/api/webhooks/chariow`
4. Chariow devrait te fournir un secret partagé pour signer les requêtes. Copie-le dans
   `CHARIOW_WEBHOOK_SECRET`. **Vérifie aussi le nom exact de l'en-tête de signature** dans l'interface
   Chariow (le code suppose `x-chariow-signature` par défaut, en HMAC-SHA256 — ajuste
   `WEBHOOK_SIGNATURE_HEADER` si Chariow utilise un autre nom).
5. Fais un paiement test si Chariow le permet, puis vérifie dans les logs du backend que le message
   `Abonnement Pro activé pour ...` apparaît.

**Important** : le webhook associe le paiement à un compte via l'e-mail utilisé lors du paiement Chariow.
Le client doit donc payer avec le même e-mail que celui de son compte sur l'app (ajoute cette précision
sur la page d'abonnement du frontend).

## 4. Endpoints

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | `{ email, password }` → crée un compte, renvoie un token |
| POST | `/api/auth/login` | `{ email, password }` → renvoie un token |
| GET | `/api/auth/me` | (auth requise) → profil + quota/plan actuels |
| POST | `/api/generate` | (auth requise) `{ system, prompt }` → génère du texte via Claude, applique le quota |
| POST | `/api/webhooks/chariow` | Appelée par Chariow, pas par le frontend |

## 5. Limites de cette version MVP

- Un seul rôle utilisateur (pas d'admin/équipe) — suffisant pour valider le modèle.
- Le rapprochement paiement ↔ compte se fait par e-mail, sans lien cryptographique fort — pour aller
  plus loin, on pourrait générer un lien de paiement unique par utilisateur via l'API Checkout de Chariow.
- Pas de réinitialisation de mot de passe, pas de vérification d'e-mail — à ajouter avant un vrai lancement public.
- SQLite aurait suffi pour un seul utilisateur (Frank), mais Postgres est nécessaire dès qu'il y a plusieurs
  comptes en production sur un hébergeur à disque éphémère (Railway/Render sans volume persistant).
