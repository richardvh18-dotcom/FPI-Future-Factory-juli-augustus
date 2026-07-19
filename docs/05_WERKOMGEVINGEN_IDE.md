# 5. Werkomgevingen & IDE Setup

Dit document beschrijft de twee primaire manieren om aan dit project te werken: geassisteerd via Antigravity (AI) of handmatig via Visual Studio Code / GitHub Codespaces.

---

## Methode 1: Werken met Antigravity (Aanbevolen voor snelle iteraties)

Antigravity is een geavanceerde agentic AI IDE (waarmee deze documentatie ook is gegenereerd). In plaats van handmatig bestanden te bewerken, stuur je het project aan via natuurlijke taal en intenties.

### Best Practices voor Antigravity

1. **Wees Specifiek:** Geef de AI zoveel mogelijk context. In plaats van *"fix de tabel"*, zeg *"de kolommen in de admin gebruikers tabel in AdminUsersView.tsx lijnen niet goed uit op mobiel."*
2. **Review Artifacts:** Antigravity maakt vaak `implementation_plan.md` of `walkthrough.md` bestanden (zogenaamde artifacts) om zijn werk samen te vatten. Lees deze altijd goed door om te controleren of de AI je intentie begrepen heeft.
3. **Pauzeren & Valideren:** Bij grote refactors zal Antigravity zelf stoppen en om toestemming vragen. Maak gebruik van deze momenten om de code lokaal te testen (`npm run dev`) voordat je hem groen licht geeft om door te gaan.
4. **Slash Commands:** Maak gebruik van ingebouwde shortcuts:
   - `/goal` - Voor langlopende taken of refactors. De AI stopt pas als het hoofddoel 100% bereikt is.
   - `/learn` - Als je de AI een specifieke project-regel hebt aangeleerd (bijv. "gebruik altijd Tailwind in plaats van custom CSS"), zorgt dit commando dat de AI dit onthoudt voor toekomstige sessies.

### Typische Workflow in Antigravity
1. Open het project in de Antigravity IDE.
2. Geef de opdracht (bijv. *"Implementeer een export-naar-CSV knop in het AdminDashboard"*).
3. De AI onderzoekt de codebase, stelt eventueel een plan voor, en schrijft de code.
4. Je controleert het resultaat in de live-preview of via `localhost`.

---

## Methode 2: Visual Studio Code & GitHub Codespaces

Voor handmatig programmeerwerk, code reviews, of het oplossen van zeer complexe TypeScript-types, is de traditionele workflow via VS Code of GitHub Codespaces ideaal.

### Lokaal met Visual Studio Code

1. **Installatie:** Zorg dat je **Node.js (v18 of nieuwer)** geïnstalleerd hebt.
2. **Extensions (Aanbevolen):**
   - *ESLint* (Dbaeumer.vscode-eslint) - Voor live code-kwaliteit waarschuwingen.
   - *Prettier* (esbenp.prettier-vscode) - Voor automatische code-formattering.
   - *Tailwind CSS IntelliSense* (bradlc.vscode-tailwindcss) - Onmisbaar voor het snel schrijven van Tailwind classes met auto-aanvulling.
   - *React Snippets* (dsznajder.es7-react-js-snippets)
3. **Starten:**
   ```bash
   npm install
   npm run dev
   ```

### Werken in de Cloud met GitHub Codespaces

Als je geen lokale omgeving wilt opzetten, of snel een wijziging wilt doen vanaf een andere computer, is GitHub Codespaces de perfecte oplossing.

1. **Starten:** Ga naar de GitHub repository van dit project. Klik op de groene `<> Code` knop, kies de **Codespaces** tab en klik op "Create codespace on main" (of je gewenste branch).
2. **Volledige Omgeving:** Binnen enkele seconden opent er een volledige VS Code omgeving direct in je browser. Alle benodigde extensies en Node.js versies zijn vooraf geconfigureerd door GitHub.
3. **Live Server:** Zodra je in de geïntegreerde terminal `npm run dev` uitvoert, detecteert Codespaces automatisch dat poort 5173 wordt geopend. Het toont een pop-up rechtsonderin waarmee je de live applicatie in een nieuw browser-tabblad kunt bekijken.
4. **Commit & Push:** Omdat je direct verbonden bent met GitHub, kun je de geïntegreerde Source Control tab (links) gebruiken om wijzigingen direct te committen en te pushen zonder SSH-keys te hoeven configureren.

### Linting & Formatting
Of je nu lokaal of in Codespaces werkt, zorg altijd dat je voor je commit de volgende check uitvoert om de CI/CD pipeline succesvol te laten verlopen:
```bash
npm run lint
npx tsc --noEmit
```
