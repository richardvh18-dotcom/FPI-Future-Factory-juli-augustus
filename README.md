# FPI Future Factory

## Deployment (actuele situatie)

Deze repository deployt via Firebase voor zowel frontend als backend.

### Frontend (Firebase Hosting)

- Live deploy via GitHub Actions op pushes naar `main`.
- Preview deploy via GitHub Actions op pull requests.

### Backend (Firebase Functions)

- Live deploy van Cloud Functions via dezelfde Firebase live workflow op `main`.
- Functions build draait automatisch via `functions` predeploy in `firebase.json`.

### Handmatige productie deploy (optioneel)

Gebruik dit wanneer je direct een productie-release wilt doen via CLI:

```bash
npm run build
firebase deploy --only hosting,functions --project future-factory-377ef
```

### Belangrijk

- Gebruik Firebase secrets en projectconfiguratie in GitHub Actions.
- Er is geen alternatief deploypad meer in deze branch buiten Firebase.

## Projectstructuur (opgeschoond)

- **Documentatie:** `docs/`
  - `docs/01_PROJECTSTRUCTUUR_EN_ARCHITECTUUR.md` - High-level architectuur en opbouw.
  - `docs/02_HANDLEIDING_ONTWIKKELAARS.md` - Setup en daily workflow.
  - `docs/03_FEATURES_EN_MODULES.md` - Uitleg specifieke features (Printen, AI, etc.).
  - `docs/04_DEPLOYMENT_EN_OPERATIONS.md` - Instructies voor deploy en emergency actions.
  - `docs/05_WERKOMGEVINGEN_IDE.md` - Uitgebreide uitleg over werken met Antigravity en VS Code / Codespaces.
  - `docs/06_AI_KNOWLEDGE_BASE.md` - Codebase architectuur-map en referentiekader voor AI-assistenten.
  - `docs/CONVERSATION_SUMMARY.md` - Levend logboek voor development afspraken.
  - `docs/archief/` - Historische logboeken en oude documentatie.
- **Hulpscripts en operationele scripts:** `scripts/`
- **Analyse notebooks:** `notebooks/`
