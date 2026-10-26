# LevelUp

Appli mobile (PWA) d'aide aux révisions pour les collégiens avec des troubles dys : photo du cours → fiche, flashcards et quiz à cocher.

- `app/` : front Vue 3 + Vite + TypeScript
- `api/` : petite API Hono sur Cloudflare Workers qui appelle Workers AI et limite l'usage

Contexte, règles et feuille de route : voir [CLAUDE.md](CLAUDE.md).

## Prérequis

- Node.js 24 (voir `.nvmrc`)

## Installation

```sh
npm install
```

### Compte Cloudflare

L'API utilise Workers AI, y compris en local : il faut un compte Cloudflare (gratuit) puis, une fois :

```sh
npx -w api wrangler login
```

### Jeton d'appli

Le jeton qui protège l'API doit être identique dans `api/.dev.vars` et `app/.env.local` (deux fichiers gitignorés). Pour le générer sans l'afficher, lancer une fois dans PowerShell, à la racine du projet :

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$utf8 = New-Object Text.UTF8Encoding $false
[IO.File]::WriteAllText("$PWD\api\.dev.vars", "APP_TOKEN=$token`n", $utf8)
[IO.File]::WriteAllText("$PWD\app\.env.local", "VITE_APP_TOKEN=$token`n", $utf8)
Remove-Variable token, bytes
```

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

Pour essayer l'API sur de vrais cours (API lancée) :

- extraction : `.\api\scripts\try-api.ps1 -Photos photo1.jpg, photo2.jpg`
- génération : `.\api\scripts\try-api.ps1 -TextFile cours.txt -Subject "Histoire-Géographie"`
