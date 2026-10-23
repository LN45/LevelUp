# LevelUp — appli d'aide aux devoirs (collège)

## Contexte

Application mobile (PWA) d'aide aux révisions pour des élèves de collège, **pensée pour les élèves avec des troubles dys** (lecture, orthographe, écriture).
L'élève prend en photo son cours (manuscrit ou imprimé) ou importe un PDF. L'IA en extrait le texte, puis génère :
- une **fiche de révision** courte,
- des **flashcards**,
- des **quiz à cocher** (aucune saisie de texte).

Utilisation principale : **sur téléphone portable**. Pas d'oral en réponse pour l'instant (prévu plus tard).

> Ce dépôt est **public**. Le contexte personnel (qui utilise l'appli, ses besoins précis) est dans `CLAUDE.local.md`, gitignoré. Tu peux t'en servir pour orienter les choix, mais **aucune information de ce fichier ne doit apparaître dans un fichier commité, un message de commit, le code, les textes de l'UI par défaut ou une requête à l'IA**.

## Règles de travail (IMPORTANT)

- On avance **une étape à la fois**, dans l'ordre de la feuille de route ci-dessous.
- **Au début d'une étape** : présente ton plan (fichiers créés ou modifiés, dépendances ajoutées, choix techniques) puis **attends ma validation** avant d'écrire du code.
- **À la fin d'une étape** : résume ce qui a été fait, explique comment tester (sur ordi et sur téléphone), coche l'étape dans ce fichier, puis **arrête-toi et attends ma validation**. Ne commence jamais l'étape suivante sans mon « ok ».
- Après ma validation, propose un message de commit (Conventional Commits).
- Si quelque chose est ambigu ou si un choix technique te semble discutable, **demande** plutôt que de supposer.
- Code propre, **sans duplication**, et **sans découpage en fichiers inutile** : on ne crée un fichier ou un composant que s'il est réutilisé ou que ça clarifie vraiment.
- Pas de dépendance ajoutée sans la justifier dans le plan.
- Langue : échanges et textes de l'UI en **français** ; code, identifiants et noms de fichiers en **anglais** ; commentaires en français, seulement quand ils apportent quelque chose.

## Stack technique

### Front — `app/`
- **Vue 3** (Composition API, `<script setup>`) + **Vite** + **TypeScript strict**
- **Pinia** (état), **Vue Router**, **VueUse**
- **Dexie** (IndexedDB) : toutes les données restent sur le téléphone
- **pdfjs-dist** : extraction de texte des PDF (ou rendu en images si PDF scanné)
- **ts-fsrs** : révision espacée
- **vite-plugin-pwa** : installation et hors-ligne
- CSS : CSS natif scoped + variables CSS (design tokens). Pas de lib UI.
- Police **Luciole** auto-hébergée (licence CC-BY), avec **OpenDyslexic** en option dans les réglages
- **Vitest** pour les tests de logique (pas besoin de tester l'UI au début)
- ESLint + Prettier

### Backend — `api/`
- **Hono** sur **Cloudflare Workers, plan gratuit** (dev local avec `wrangler dev`)
- IA : **Mistral, plan gratuit « Experiment »**, via le SDK officiel `@mistralai/mistralai`. Modèle configurable via la variable d'env `MISTRAL_MODEL` (défaut : `mistral-small-latest`, qui accepte les images)
- **Zod** : validation des entrées et des sorties de l'IA
- Sorties structurées : utiliser le mode JSON schema de Mistral (`response_format`) pour forcer un JSON conforme, puis **toujours** valider avec Zod
- Tout l'appel au fournisseur d'IA est isolé dans **un seul module**, pour pouvoir passer plus tard à un autre fournisseur (ex. API Claude) sans toucher au reste
- Seul rôle du backend : cacher la clé API, appeler l'IA, limiter l'usage
- Rester dans les limites du plan gratuit Workers (10 ms de CPU par requête : pas de traitement d'image lourd côté Worker, la compression se fait côté client)

### Hébergement (objectif : 0 €)
- Front : **GitHub Pages**, déployé par **GitHub Actions** à chaque push sur `main`. Configurer la `base` Vite au nom du dépôt et utiliser le mode hash de Vue Router (Pages ne gère pas les routes côté serveur).
- API : **Cloudflare Workers** (sous-domaine `*.workers.dev` gratuit), déployée avec `wrangler deploy`.
- Aucun service payant, aucune carte bancaire.

### Sécurité
- La clé Mistral n'est **jamais** dans le front, ni dans le dépôt, ni dans un fichier commité, ni dans un log, ni dans la conversation. En production, c'est un secret Cloudflare (`wrangler secret put`) ; en local, `api/.dev.vars` (gitignoré dès l'étape 0).
- **CORS** restreint à l'origine GitHub Pages de l'appli (et `localhost` / IP locale en dev uniquement).
- **Jeton d'appli** (`APP_TOKEN`) vérifié sur chaque requête. C'est une barrière légère : il est visible dans le bundle front, donc il ne remplace ni le CORS ni le quota.
- **Quota quotidien** côté Worker (compteur dans Workers KV, plan gratuit), avec un message clair dans l'appli quand il est atteint.
- **Limites de taille** sur les images (nombre et poids) et sur le texte envoyé ; rejet de tout ce qui ne correspond pas au schéma Zod.
- Ne jamais logger le contenu des cours ni les réponses de l'IA ; logger seulement les erreurs techniques.
- Ne jamais envoyer à l'IA le nom de l'élève ni d'information personnelle (le plan gratuit Mistral peut utiliser les requêtes pour entraîner ses modèles).
- Dépendances : versions fixées, pas de paquet exotique.

### Sécurité du dépôt GitHub (public)
- `package-lock.json` toujours commité ; installation en CI avec `npm ci` uniquement.
- Mises à jour de dépendances relues avant fusion (pas de fusion automatique des PR Dependabot) ; signaler toute nouvelle dépendance ou tout script `postinstall` suspect.
- Workflows GitHub Actions : `permissions` minimales déclarées explicitement (déploiement Pages : `contents: read`, `pages: write`, `id-token: write`) ; actions tierces épinglées par **SHA de commit** (avec le tag en commentaire) ; jamais de `pull_request_target`.
- Aucun secret dans le dépôt ni dans les workflows ; le front ne reçoit que des valeurs publiques (URL de l'API, `APP_TOKEN`).

### Actions manuelles (à faire par moi, pas par toi)
Quand une étape en a besoin, **arrête-toi**, explique précisément quoi faire et attends que je confirme :
- créer le dépôt GitHub et activer GitHub Pages (source : GitHub Actions) ;
- sécuriser le compte et le dépôt GitHub : double authentification (passkey ou appli), *secret scanning* + *push protection*, alertes Dependabot, règle sur `main` interdisant force push et suppression, approbation requise pour les workflows de contributeurs extérieurs ;
- créer le compte Cloudflare et lancer `wrangler login` ;
- créer le compte Mistral, activer le plan Experiment et générer la clé API ;
- saisir les secrets moi-même (`wrangler secret put MISTRAL_API_KEY`, `wrangler secret put APP_TOKEN`, et `api/.dev.vars` en local). **Ne me demande jamais de te coller une clé.**

## Accessibilité dys (exigences transverses, à respecter à chaque étape)

- **Mobile-first** : utilisable d'une main, gros boutons (≥ 48 px), navigation en bas, une action principale par écran.
- **Aucune saisie de texte obligatoire** pour l'élève (la correction du texte extrait peut être faite par un parent).
- **Bouton 🔊 (lecture vocale)** sur toute fiche, question, proposition, carte et explication, via `speechSynthesis` en voix française.
- Typographie : taille de base ≥ 18 px, interligne ≥ 1.5, espacement des lettres légèrement augmenté, texte aligné à gauche (jamais justifié), fond crème (pas de blanc pur), bon contraste.
- Réglages persistés : police, taille, interligne.
- Pas de chronomètre, pas de pénalité, feedback encourageant, séries courtes (5 à 8 questions).
- Ne jamais juger l'orthographe.

## Thème visuel : Kitsuné

L'appli est construite autour de l'univers des kitsunés (renards du folklore japonais), **sans jamais sacrifier la lisibilité dys** : en cas de conflit, l'accessibilité gagne.

- **Mascotte** : un petit kitsuné **original** (pas de personnage existant de jeu, d'anime ou de manga), dessiné en SVG simple et expressif, avec quelques états : content, encourageant, pensif, fier. Il accueille l'élève, donne les consignes et félicite. Ses phrases sont courtes et lisibles à voix haute (🔊).
- **Progression par queues** : dans la légende, un kitsuné gagne des queues en gagnant en sagesse, jusqu'à 9. C'est le fil rouge du « LevelUp » : les révisions font gagner de l'expérience, et chaque niveau fait pousser une nouvelle queue à la mascotte. Montée de niveau célébrée, jamais de perte de queue ni de punition.
- **Feedback** : bonne réponse = petites flammes de renard (kitsunebi) qui s'allument ; erreur = le kitsuné encourage gentiment et la question reviendra plus tard.
- **Palette** : orange renard, vermillon (torii) et or en couleurs d'accent, indigo profond pour le texte et la navigation, fond crème. Les contrastes respectent WCAG AA.
- **Motifs** : torii, lanternes, feuilles d'érable, masque de kitsuné, utilisés en décor léger (en-têtes, écrans vides, écrans de fin), **jamais derrière du texte**.
- Pas de texte en japonais dans l'interface (difficile à lire), sauf éventuellement un mot décoratif accompagné de sa lecture.
- Animations courtes et douces, désactivées si `prefers-reduced-motion`.
- Pseudo de l'élève demandé au premier lancement (aucune valeur personnelle par défaut dans le code), modifiable dans les réglages, stocké en local uniquement, **jamais envoyé à l'IA**.

## Contraintes de génération IA (à mettre dans les prompts)

- Niveau 6e, vocabulaire simple, phrases courtes (≤ 15 mots).
- Fiche : 5 à 8 points clés maximum, mots-clés marqués en gras, définitions courtes, exemples concrets.
- Flashcards : recto = une question ou un mot, verso = réponse courte.
- Quiz : **3 choix** par QCM, propositions courtes, pas de piège ni de double négation, une explication d'une phrase par question.
- Rester fidèle au cours : ne rien inventer qui n'y est pas.

## Modèle de données (indicatif, à affiner à l'étape concernée)

`Subject` (matière) · `Lesson` (titre, matière, texte source relu, date) · `Sheet` (fiche liée à une leçon) · `Card` (flashcard + état FSRS) · `QuizQuestion` (type, question, choix, bonne réponse, explication) · `Settings`.

## Feuille de route

- [x] **Étape 0 — Initialisation** : dépôt git (+ dépôt GitHub et sa sécurisation, actions manuelles), `.gitignore` incluant `CLAUDE.local.md`, `.dev.vars` et `.env*` (à vérifier **avant** le premier commit), `app/` (Vite + Vue + TS strict, Pinia, Router, ESLint, Prettier, Vitest) et `api/` (Hono + Wrangler). Scripts pour lancer les deux. Lancement de Vite avec `--host` pour tester sur téléphone en Wi-Fi. README court.
- [x] **Étape 1 — Socle visuel accessible** : design tokens (couleurs, espacements, typo) selon la palette Kitsuné, mascotte SVG et ses états, police Luciole, layout mobile avec navigation en bas, composant de lecture vocale réutilisable, écran Réglages (police, taille, interligne) persisté.
- [ ] **Étape 2 — Données locales** : base Dexie avec les entités ci-dessus, `navigator.storage.persist()`, stores Pinia, gestion des matières.
- [ ] **Étape 3 — API : socle + extraction** : comptes Cloudflare et Mistral + secrets (actions manuelles), module fournisseur IA, middleware jeton, CORS, limites de taille, quota quotidien KV ; route `POST /extract` (images → texte propre du cours via la vision du modèle).
- [ ] **Étape 4 — Capture du cours** : plusieurs photos par leçon, compression côté client (~1600 px, JPEG), import PDF (texte via pdfjs, sinon pages en images), appel à `/extract`, **écran de relecture et correction** du texte, choix de la matière, enregistrement de la leçon.
- [ ] **Étape 5 — API : génération** : route `POST /generate` (texte → fiche + flashcards + quiz) en sortie structurée validée par Zod, prompt intégrant les contraintes dys.
- [ ] **Étape 6 — Affichage de la fiche** : rendu lisible, lecture vocale par section, liste des leçons par matière.
- [ ] **Étape 7 — Flashcards** : retournement de carte, 🔊 recto et verso, boutons « je savais / je ne savais pas ».
- [ ] **Étape 8 — Quiz à cocher** : QCM 3 choix et vrai/faux, 🔊 partout, feedback immédiat avec explication (flammes kitsunebi, mascotte), écran de fin encourageant.
- [ ] **Étape 9 — Révision espacée** : intégration de ts-fsrs, écran d'accueil « À réviser aujourd'hui ».
- [ ] **Étape 10 — Formats de quiz supplémentaires** : relier par paires, remettre dans l'ordre (sans saisie).
- [ ] **Étape 11 — Suivi et sauvegarde** : expérience et niveaux (queues du kitsuné, jusqu'à 9) avec célébration de montée de niveau, progression par matière, export/import JSON de toutes les données.
- [ ] **Étape 12 — PWA et déploiement** : manifest, icônes, hors-ligne, invitation à installer ; déploiement front sur GitHub Pages via GitHub Actions (permissions minimales, actions épinglées par SHA, `npm ci`), API via `wrangler deploy`, secrets de production, CORS limité à l'URL GitHub Pages ; vérification finale de la checklist sécurité. L'installation PWA et le hors-ligne exigent HTTPS : les tester sur la version GitHub Pages (ou via un tunnel HTTPS gratuit type `cloudflared tunnel`), pas sur l'IP locale.

Plus tard (hors périmètre actuel) : interrogation orale avec réponses à la voix.
