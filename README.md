# AI Sales Cameroun — Backend Centralized WhatsApp

Cette version remplace le modèle BYO API par une expérience **WhatsApp centralisée** : le client ne saisit plus de Phone Number ID ni de token. Il clique sur **Connecter avec Meta**, autorise son entreprise et son numéro via Meta Embedded Signup, puis le backend reçoit le code d'autorisation, l'échange côté serveur et stocke le jeton d'intégration chiffré.

## Architecture
- Frontend Vercel : Meta JavaScript SDK + Embedded Signup.
- Backend Railway : échange du code, validation, abonnement du WABA aux webhooks, envoi/réception des messages.
- PostgreSQL : WABA/numéro + jeton chiffré AES-256-GCM.
- Meta Webhook : `GET/POST /api/webhooks/whatsapp`.
- Connexion client : `POST /api/whatsapp/onboarding/exchange`.

## Variables Meta
- `META_APP_ID`
- `META_APP_SECRET`
- `META_GRAPH_VERSION` (exemple actuel du pack : `v25.0`; adapter à la version disponible dans votre App Meta)
- `META_REDIRECT_URI` si votre configuration Login for Business en exige une
- `META_EMBEDDED_SIGNUP_CONFIG_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_TOKEN_ENCRYPTION_KEY`

**Ne mettez jamais `META_APP_SECRET` ou un token WhatsApp dans le frontend.**

## Prérequis Meta
Meta indique que Embedded Signup est destiné aux Solution Partners, Tech Providers et Tech Partners. Pour publier le flux, l'application doit passer par App Review et obtenir l'Advanced Access aux permissions `business_management` et `whatsapp_business_management` selon le flux partenaire. La configuration et les permissions doivent être créées dans le tableau de bord Meta.

## Endpoints
- `GET /api/whatsapp/connection` : état de connexion, sans exposer le token.
- `POST /api/whatsapp/onboarding/exchange` : échange serveur du code Embedded Signup.
- `DELETE /api/whatsapp/connection` : déconnexion.
- `PATCH /api/whatsapp/settings` : réglages de l'agent.
- `GET /api/webhooks/whatsapp` : vérification Meta.
- `POST /api/webhooks/whatsapp` : événements WhatsApp.

## Déploiement Railway
1. Ajouter les variables Meta ci-dessus dans Railway.
2. Vérifier `CORS_ORIGIN` avec l'URL Vercel.
3. Commit/push sur `main`.
4. Railway redéploie.
5. Dans Meta, configurer le webhook avec :
   `https://pulse-chariow-saas-production.up.railway.app/api/webhooks/whatsapp`
6. Utiliser exactement la valeur de `WHATSAPP_VERIFY_TOKEN` pour la vérification.

## Important sur le modèle centralisé
Le client ne gère pas son token. En revanche, il doit toujours autoriser son entreprise/numéro WhatsApp dans le parcours Meta. Le modèle partenaire peut aussi impliquer la facturation/ligne de crédit Meta selon votre statut et votre configuration partenaire.
