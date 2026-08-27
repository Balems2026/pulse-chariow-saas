# DEPLOIEMENT CLIC PAR CLIC

1. Ouvrir GitHub Desktop et sélectionner `pulse-chariow-saas`.
2. Repository -> Show in Explorer.
3. Faire une copie de sauvegarde du dossier actuel.
4. Copier le contenu de `AI-Sales-Cameroun-Backend-Final` dans le dépôt.
5. NE PAS supprimer le dossier `.git`.
6. Vérifier que `package.json` est directement à la racine.
7. Vérifier `src/server.js` et `src/routes/`.
8. GitHub Desktop -> Changes.
9. Summary : `Deploy final AI Sales Cameroun backend`.
10. Commit to main.
11. Push origin.
12. Railway -> projet `pulse-chariow-saas` -> Deployments.
13. Attendre Success/Running.
14. Ouvrir `https://DOMAINE-RAILWAY/health` : attendu `{"ok":true}`.
15. Vérifier `CORS_ORIGIN` dans Railway : URL Vercel du Front-end.
16. Vérifier les variables Chariow et les vrais IDs produits.
17. Tester la connexion au SaaS.
18. Tester CRM, Catalogue, FAQ, Séquences, Performance.
19. Tester WhatsApp seulement avec de vrais identifiants Meta.
20. Tester Chariow avec un achat réel ou un événement réellement renseigné.
