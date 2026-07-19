# 2. Handleiding Ontwikkelaars & Workflow

Dit document beschrijft de dagelijkse workflow, branch-strategieën en testrichtlijnen voor ontwikkelaars die aan het Future Factory platform werken.

---

## 1. Ontwikkelomgeving (Setup)

### Vereisten
- Node.js (v18+)
- npm of yarn
- Firebase CLI (`npm install -g firebase-tools`)

### Lokaal draaien
```bash
# Installeer dependencies
npm install

# Start de lokale Vite ontwikkelserver
npm run dev
# De applicatie draait nu standaard op http://localhost:5173
```

*(Zie de `04_DEPLOYMENT_EN_OPERATIONS.md` voor de inrichting van `.env` bestanden en Firebase configuratie).*

---

## 2. Branch Strategie

We werken veelal met meerdere actieve branches, afhankelijk van de fase (bijv. live pilot of preview).

```text
FPIFF-30-1 Repository
│
├── main (of FpiFF-Pilot-Ready / Productie)
│   ├── Status: In productie
│   ├── Wijzigingen: Alleen hotfixes en afgeronde features
│   └── Deploy: Direct naar Firebase Hosting (production)
│
└── preview-v2 (of develop / EXPERIMENTAL)
    ├── Status: Actieve ontwikkeling
    ├── Wijzigingen: Nieuwe features, experimenten
    └── Deploy: Test/staging omgeving via Pull Requests
```

---

## 3. Dagelijkse Workflow

### Werken aan Bugs (Hotfixes / Productie)
Als er een directe fout op de productievloer is:
```bash
git checkout main
git pull origin main
# Maak de fix...
git add .
git commit -m "fix: beschrijving van de fix"
git push origin main
# Deploy direct (zie deployment guide)
```

### Werken aan Nieuwe Features (Development)
Maak altijd een feature branch aan vanaf je development branch.
```bash
git checkout preview-v2
git pull origin preview-v2
git checkout -b feature/naam-van-feature

# Werk aan code...
git add .
git commit -m "feat: beschrijving van nieuwe feature"

# Na testen lokaal, open een Pull Request naar preview-v2
```

---

## 4. Testen & Kwaliteit

### Side-by-side Testing
Als je twee branches wilt vergelijken (bijv. productie vs de nieuwe preview):
```bash
# Terminal 1 - Productie/Main
git checkout main
npm run dev -- --port 3000

# Terminal 2 - Preview/Develop
git checkout preview-v2
npm run dev -- --port 3001
```

### Strikte Validatie
Zorg dat je code valideert voordat je push of deploy doet.
```bash
# Voer TypeScript strict checks uit
npx tsc --noEmit

# Lint de applicatie
npm run lint
```

---

## 5. Commit Message Conventie

We volgen standaard Angular-style commit conventies:
- `feat:` - Nieuwe features
- `fix:` - Bug fixes / Hotfixes
- `docs:` - Documentatie updates
- `chore:` - Kleine maintenance (package updates, etc.)
- `refactor:` - Code restructuring zonder functionaliteit te wijzigen
- `style:` - UI/UX en CSS (Tailwind) aanpassingen
