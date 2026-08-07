# Richtlijnen voor de Repository

Dit document bevat essentiële informatie voor AI-agents en ontwikkelaars die werken aan de Future Factory FPI-repository.

## Voorkeuren voor AI-agents

- **Taal**: Standaard antwoorden in het Nederlands.
- **Wijzigingen bijhouden**: Alle handelingen en belangrijke wijzigingen bijhouden in [`docs/CONVERSATION_SUMMARY.md`](docs/CONVERSATION_SUMMARY.md). Nieuwste vermeldingen altijd **bovenaan** plaatsen.
- **Deploy volgorde**: Bij een deploy eerst de appversie bumpen, daarna deployen, en vervolgens een `git push` doen.
- **Versiebeheer**: Deploy/version-wijzigingen altijd afstemmen op zowel `public/version.json` als `package.json`.

## Projectstructuur & Module-indeling

De applicatie is een **React Single Page Application (SPA)** gebouwd met **Vite** en **TypeScript**, met **Firebase** als backend (Firestore, Auth, Hosting, Functions).

- **`src/components/`**: Domeinspecifieke React-componenten (bijv. `digitalplanning/`, `admin/`, `printer/`).
- **`src/hubs/`**: Slimme orkestratiecomponenten voor specifieke machines of afdelingen (bijv. `Terminal.tsx`, `BM01Hub.tsx`).
- **`src/hooks/`**: Aangepaste hooks voor data-ophaling (`useTerminalData.ts`) en actie-orkestratie (`useTerminalActions.ts`).
- **`src/services/`**: Kernbedrijfslogica, inclusief lotnummervalidatie en AI-assistentservices.
- **`src/config/`**: Firebase-initialisatie en gecentraliseerde databasepaden (`dbPaths.ts`).
- **`functions/`**: Firebase Cloud Functions voor server-side logica en integraties.
- **`docs/`**: Uitgebreide systeemdocumentatie en ontwikkelingslogboeken.

## Build-, Test- en Ontwikkelcommando's

### Ontwikkeling
- **`npm run dev`**: Start de Vite-ontwikkelserver op poort 3000.
- **`npm run type-check`**: Voert TypeScript-compilatiecontroles uit zonder bestanden te genereren.
- **`npm run lint`**: Voert ESLint uit over de `src/`-map.

### Testen
- **`npm run test`**: Voert unit- en integratietests uit met **Vitest**.
- **`npm run test:watch`**: Voert Vitest uit in watch-modus.
- **`npm run test:e2e`**: Voert end-to-end tests uit met **Playwright**.
- **`npm run test:rules`**: Test Firestore-beveiligingsregels via de Firebase-emulator.

### Deployment & Validatie
- **`npm run validate`**: Uitgebreide controle (TS-handhaving, lint, type-check en build).
- **`npm run deploy`**: Standaard deployflow (versie bumpen, build, verificatie en Firebase-deploy).
- **`npm run deploy:prod`**: Gerichte productiedeploy naar het standaard Firebase-project.

## Codeerstijl & Naamconventies

- **TypeScript**: Strikte typering is verplicht. Vermijd `any` en `@ts-nocheck` overrides.
- **Linting**: Afgedwongen via **ESLint** en **lint-staged**. Kernlogica mag geen `eslint-disable` bevatten.
- **State management**: Gebruikt **Zustand** voor lichtgewicht globale state.
- **Stijlen**: **Tailwind CSS** en **PostCSS** worden gebruikt voor UI-styling.
- **I18n**: Meertalige ondersteuning beheerd via `i18next`.

## Commit- & Pull Request-richtlijnen

Deze repository volgt **Conventional Commits** voor alle wijzigingen:
- `feat:`: Nieuwe functionaliteit.
- `fix:`: Bugfixes.
- `chore:`: Onderhoudstaken of dependency-updates.
- `docs:`: Verbeteringen aan documentatie.
- `version:bump:patch`: Versiebeheer wordt afgehandeld via gespecialiseerde scripts tijdens deployment.
