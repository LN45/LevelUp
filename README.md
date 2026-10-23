# LevelUp

Appli mobile (PWA) d'aide aux révisions pour les collégiens avec des troubles dys : photo du cours → fiche, flashcards et quiz à cocher.

- `app/` : front Vue 3 + Vite + TypeScript
- `api/` : petite API Hono sur Cloudflare Workers (cache la clé IA, limite l'usage)

Contexte, règles et feuille de route : voir [CLAUDE.md](CLAUDE.md).

## Prérequis

- Node.js 24 (voir `.nvmrc`)

## Installation

```sh
npm install
```

Pour l'API en local, copier `api/.dev.vars.example` en `api/.dev.vars` et remplir les valeurs (fichier gitignoré, à ne jamais commiter).

## Lancer en dev

```sh
npm run dev
```

- Appli : http://localhost:5173
- API : http://localhost:8787 (aussi accessible via l'appli sur `/api/...`, ex. http://localhost:5173/api/health)

### Tester sur téléphone

1. Le téléphone et l'ordinateur doivent être sur le même Wi-Fi.
2. Ouvrir sur le téléphone l'adresse « Network » affichée par Vite (ex. `http://192.168.x.x:5173`).
3. Sous Windows, au premier lancement, autoriser Node.js sur les **réseaux privés** quand le pare-feu le demande.

## Autres commandes

| Commande               | Effet                                                                     |
| ---------------------- | ------------------------------------------------------------------------- |
| `npm run dev:app`      | appli seule                                                               |
| `npm run dev:api`      | API seule                                                                 |
| `npm run build`        | build de production de l'appli                                            |
| `npm run test`         | tests (Vitest)                                                            |
| `npm run lint`         | ESLint (app + api)                                                        |
| `npm run format`       | Prettier sur tout le dépôt                                                |
| `npm run typecheck`    | vérification TypeScript (app + api)                                       |
| `npm run types -w api` | régénère les types Workers après une modification de `api/wrangler.jsonc` |
