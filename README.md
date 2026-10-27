# LevelUp

Appli mobile (PWA) d'aide aux révisions pour les collégiens avec des troubles dys : photo du cours → fiche de révision et quiz à cocher, avec révision espacée.

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

## Déploiement

- Appli : GitHub Pages, déployée par GitHub Actions ([deploy.yml](.github/workflows/deploy.yml)) à chaque push sur `main`, à l'adresse `https://ln45.github.io/LevelUp/`.
- API : Cloudflare Workers, déployée à la main depuis l'ordinateur.

### Mise en place (une fois)

1. **GitHub Pages** : _Settings › Pages › Build and deployment › Source_ = **GitHub Actions**.
2. **API** : `npm run deploy -w api`. Au tout premier déploiement, Wrangler peut demander de choisir un sous-domaine `workers.dev`. Noter l'URL affichée (`https://levelup-api.<sous-domaine>.workers.dev`).
3. **Jeton de production** (différent de celui de dev) : dans PowerShell, à la racine du projet. Le jeton est envoyé à Cloudflare puis copié dans le presse-papiers, sans être affiché :

   ```powershell
   $bytes = New-Object byte[] 32
   [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
   $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
   $file = Join-Path $env:TEMP 'levelup-secret.json'
   [IO.File]::WriteAllText($file, "{`"APP_TOKEN`":`"$token`"}", (New-Object Text.UTF8Encoding $false))
   npx -w api wrangler secret bulk $file
   Remove-Item $file
   Set-Clipboard -Value $token
   Remove-Variable token, bytes
   ```

4. **GitHub** : _Settings › Secrets and variables › Actions_ :
   - onglet **Secrets** › _New repository secret_ : nom `VITE_APP_TOKEN`, valeur collée (Ctrl+V). Vider ensuite le presse-papiers : `Set-Clipboard -Value ' '` ;
   - onglet **Variables** › _New repository variable_ : nom `VITE_API_URL`, valeur = l'URL de l'API (étape 2).
5. Lancer le déploiement : push sur `main`, ou _Actions › Déploiement GitHub Pages › Run workflow_.

### Mettre à jour

- Appli : push sur `main`. Sur les téléphones, l'accueil propose « Mettre à jour » (sinon, mise à jour au lancement suivant).
- API : `npm run deploy -w api`.

L'installation sur téléphone et le hors-ligne exigent HTTPS : ils se testent sur la version GitHub Pages, pas sur l'IP locale.

## Autres commandes

| Commande                | Effet                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `npm run dev:app`       | appli seule                                                               |
| `npm run dev:api`       | API seule                                                                 |
| `npm run build`         | build de production de l'appli                                            |
| `npm run test`          | tests (Vitest)                                                            |
| `npm run lint`          | ESLint (app + api)                                                        |
| `npm run format`        | Prettier sur tout le dépôt                                                |
| `npm run typecheck`     | vérification TypeScript (app + api)                                       |
| `npm run deploy -w api` | déploie l'API sur Cloudflare Workers                                      |
| `npm run types -w api`  | régénère les types Workers après une modification de `api/wrangler.jsonc` |

Pour essayer l'API sur de vrais cours (API lancée) :

- extraction : `.\api\scripts\try-api.ps1 -Photos photo1.jpg, photo2.jpg`
- génération : `.\api\scripts\try-api.ps1 -TextFile cours.txt -Subject "Histoire-Géographie"`
