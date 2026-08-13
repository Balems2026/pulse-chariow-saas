# WhatsBiz Pro AI — Backend SaaS

Backend Node.js/Express/PostgreSQL pour WhatsBiz Pro AI.

## Offre V1

### Free
- 15 générations IA par mois
- assistant commercial IA de base
- réponses, reformulations et messages commerciaux simples
- accès standard

### Pro — 5 000 FCFA/mois
- 300 générations IA par mois
- fonctionnalités commerciales avancées
- campagnes WhatsApp
- séquences de relance
- argumentaires de vente
- analyse de conversations
- réponses adaptées au profil du prospect
- scripts de prospection
- bibliothèque de modèles commerciaux (API prête)
- statistiques d'utilisation
- support prioritaire
- accès aux futures fonctionnalités Pro

La formule annuelle prévue est de 50 000 FCFA/an et utilise un cycle de 365 jours.

## Endpoints principaux

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/generate`
- `GET /api/pro/features`
- `GET /api/pro/stats`
- `POST /api/webhooks/chariow`
- `GET /health`

### Génération IA

`POST /api/generate` avec authentification Bearer et :

```json
{
  "prompt": "Rédige un message pour vendre...",
  "feature": "basic"
}
```

Fonctionnalités Pro disponibles via `feature` :

- `campaign`
- `followup_sequence`
- `sales_argument`
- `conversation_analysis`
- `prospect_profile`
- `prospecting_script`
- `template`
- `stats` (consultation via `/api/pro/stats`)

Le serveur contrôle le plan et le quota avant chaque génération. Une génération réussie consomme une unité, Free comme Pro.

## Chariow

Le endpoint Pulse est :

`https://TON-DOMAINE-RAILWAY/api/webhooks/chariow`

Dans Chariow :
1. Créer un Pulse.
2. Événement : **Vente réussie**.
3. Appliquer au produit : **Oui**.
4. Produit : **WhatsBiz Pro AI — Pro Mensuel**.
5. URL : `https://pulse-chariow-saas-production.up.railway.app/api/webhooks/chariow`.

Le backend attend le secret dans `CHARIOW_WEBHOOK_SECRET` et, par défaut, la signature dans `x-chariow-signature`. Vérifier le nom exact de l'en-tête et le format de signature fournis par l'interface Chariow avant la mise en production.

Pour renforcer le filtrage, renseigner `CHARIOW_PRO_MONTHLY_PRODUCT_ID` et `CHARIOW_PRO_YEARLY_PRODUCT_ID` avec les identifiants produits Chariow.

Le rapprochement du paiement avec un compte se fait actuellement par l'e-mail utilisé sur Chariow. Le client doit utiliser le même e-mail que celui de son compte WhatsBiz.

## Base de données

Les tables sont créées au démarrage. Le schéma conserve les utilisateurs, compteurs mensuels et événements webhook pour assurer l'idempotence.

## Déploiement Railway

Commande de démarrage : `npm start`.

Variables minimales : `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `CHARIOW_WEBHOOK_SECRET`, `FREE_MONTHLY_QUOTA=15`, `PRO_MONTHLY_QUOTA=300`, `PRO_CYCLE_DAYS=30`, `CORS_ORIGIN`.

Après modification, pousser le dépôt GitHub connecté à Railway et attendre un nouveau déploiement.
