# Future Factory - Architectuurdocument

Dit document beschrijft de architectuur en ontwerppatronen van de Future Factory applicatie. Het is bedoeld om nieuwe ontwikkelaars snel wegwijs te maken in de codebase en de gemaakte technische beslissingen toe te lichten.

## 1. High-Level Overzicht
De applicatie is een **React Single Page Application (SPA)**, gebouwd met **Vite** en **TypeScript**.
Als backend wordt **Firebase** gebruikt (Firestore voor de database, Firebase Auth voor authenticatie, en Firebase Hosting voor deployment).

Het doel van het systeem is het digitaal aansturen van de productievloer, het afhandelen van planningen, lotnummer-generatie, en het direct printen van ZPL labels via Zebra printers.

## 2. Belangrijkste Concepten & Lagen

### 2.1 UI & Orkestratie (Hubs)
De applicatie maakt gebruik van "Hubs" per specifieke machine of afdeling (bijv. `Terminal.tsx` voor wikkelstations, `BM01Hub.tsx` voor de eindinspectie).
- **Slimme Orkestrators:** Sinds de refactor in juli 2026 fungeren deze hubs puur als orkestrators. Ze bevatten zelf weinig tot geen bedrijfslogica.
- **Tab-Componenten:** De UI is opgedeeld in losse tab-componenten (bijv. `BM01InspectionTab.tsx`, `TerminalPlanningView.tsx`) voor maximale herbruikbaarheid en leesbaarheid.

### 2.2 Data Layer (Custom Hooks)
Alle interacties met Firestore (zoals `onSnapshot` listeners en queries) zijn geëxtraheerd naar gespecialiseerde data-hooks.
- **Voorbeelden:** `useTerminalData.ts`, `useBM01Data.ts`.
- **Waarom:** Dit scheidt de data-fetching van de UI, voorkomt oneindige render-loops, en zorgt ervoor dat componenten alleen herladen wanneer relevante data wijzigt.

### 2.3 Action Layer
Complexe acties, state-beheer voor modals en hardware-interacties leven in Action Hooks.
- **Voorbeeld:** `useTerminalActions.ts`.
- **Functie:** Bevat functies zoals `handleStartProduction`, `handleScan`, en beheert de statussen van bijbehorende modals (bijv. Release of Start Modals).

### 2.4 Print Queue & WebUSB
De applicatie integreert direct met industriële printers (bijv. Zebra ZM400).
- **WebUSB:** Bepaalde componenten (zoals `PrintQueueAutoProcessor`) onderhouden een actieve heartbeat via WebUSB met de lokaal aangesloten printer.
- **Print Queue (Firestore):** Acties zoals `queuePrintJob` schrijven print-opdrachten naar een specifieke subcollectie in Firestore. De lokale processor pikt deze op, print de labels (ZPL), en markeert ze als afgerond. Dit garandeert dat labels nooit "kwijtraken" bij netwerkstoringen.

## 3. Mappenstructuur

- `src/components/` - Bevat alle React componenten, gegroepeerd per domein (`digitalplanning/`, `admin/`, `products/`).
- `src/services/` - Bestanden met zware backend-logica (bijv. `planningSecurityService.ts` en lotnummer validatie).
- `src/hooks/` - Gedeelde React hooks, waaronder Authenticatie (`useAdminAuth.ts`) en Firebase data hooks.
- `src/config/` - Firebase initialisatie (`firebase.ts`) en gecentraliseerde database paden (`dbPaths.ts`).
- `src/utils/` - Helper functies voor datumnotaties, status-checks en filtering.
- `docs/` - Systeemdocumentatie (dit bestand) en logboeken (`CONVERSATION_SUMMARY.md`).
- `tools/` - Losse scripts voor eenmalige migraties of datamanipulatie (buiten de bundel van de app).

## 4. Offline Tolerantie & Firestore Caching
De fabrieksvloer (vooral tablets) kan last hebben van instabiele WiFi.
- **IndexedDB Cache:** Firestore caching staat aan met een expliciete limiet van **50MB** (om browser `QuotaExceeded` crashes te voorkomen).
- **Soft Recovery:** Bij een tijdelijk verbroken verbinding laadt de app uit de cache. Er is een automatische opschoon-routine ingebouwd (`clearIndexedDb`) voor zware corrupties.

## 5. Deployment & Kwaliteit
- **Type Veiligheid:** Strikte TypeScript zonder `any` overrides (ongoing). Valideer via `npx tsc --noEmit`.
- **Linting:** ESLint zonder `/* eslint-disable */` escapes in de core logica (`npm run lint`).
- **Deployment Safety:** Deployments via `npm run deploy` voeren standaard `scripts/verify-build-output.cjs` uit. Dit script stopt de uitrol als de `dist/` map corrupt is, om "Firebase 404 Page Not Found" fouten voor eindgebruikers te voorkomen.
