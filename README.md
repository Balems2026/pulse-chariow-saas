# AI Sales Cameroun — Backend final

Version alignée sur le Front-end final fourni.

## Plans
- Free : 15 générations/mois
- Pro : 14 900 FCFA/mois — 500 générations/mois
- Business : 39 900 FCFA/mois — 2 000 générations/mois

## Routes
Auth, génération IA, CRM Contacts/Pipeline/Segments, Catalogue, FAQ,
Séquences/Tâches, Analytics, Conversations WhatsApp, Agent IA WhatsApp,
Administration, proxy Chariow et webhook Chariow.

## Déploiement
Conserver le dépôt Git existant et son dossier `.git`. Remplacer le code
par ce dossier, vérifier les variables Railway, commit puis push.

Variables indispensables :
DATABASE_URL, JWT_SECRET, ANTHROPIC_API_KEY, CORS_ORIGIN,
CHARIOW_API_KEY, CHARIOW_WEBHOOK_SECRET,
MONTHLY_PRODUCT_ID, YEARLY_PRODUCT_ID,
BUSINESS_MONTHLY_PRODUCT_ID, BUSINESS_YEARLY_PRODUCT_ID,
FREE_MONTHLY_QUOTA=15, PRO_MONTHLY_QUOTA=500, BUSINESS_MONTHLY_QUOTA=2000.

Pour l'activation Chariow, l'e-mail de l'achat doit être celui du compte
AI Sales Cameroun. Le webhook essaie plusieurs emplacements de l'e-mail et
du produit et journalise les candidats. Si Chariow n'envoie aucun produit
identifiable, le Backend retourne product_unmatched au lieu de deviner.

Le Front-end final utilise /api/crm/*, /api/products, /api/faqs,
/api/sequences, /api/tasks, /api/analytics/*, /api/whatsapp/* et
/api/admin/*.

La traduction multilingue est supportée via /api/generate et dans les
conversations. L'envoi WhatsApp réel nécessite un accès Meta Cloud API valide.
