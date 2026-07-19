# 1. Projectstructuur & Architectuur

Dit document beschrijft de architectuur en ontwerppatronen van de Future Factory applicatie. Het is bedoeld om (nieuwe) ontwikkelaars snel wegwijs te maken in de codebase en de gemaakte technische keuzes toe te lichten.

## High-Level Overzicht
De applicatie is een **React Single Page Application (SPA)**, gebouwd met **Vite** en **TypeScript**.
Als backend wordt **Firebase** gebruikt:
- **Firestore** voor de NoSQL database.
- **Firebase Auth** voor authenticatie.
- **Firebase Hosting** voor deployment van de frontend.
- **Firebase Functions** voor server-side logica en integraties.

Het doel van het systeem is het digitaal aansturen van de productievloer, het afhandelen van planningen, lotnummer-generatie, en het direct printen van ZPL labels via Zebra printers.

---

## Mappenstructuur

De root van het project bevat configuratiebestanden (`package.json`, `vite.config.ts`, `firebase.json`, etc.). De broncode bevindt zich voornamelijk in de `src/` map.

- `src/components/` - Bevat alle React componenten, gegroepeerd per domein (bijv. `digitalplanning/`, `admin/`, `products/`, `printer/`).
- `src/services/` - Bestanden met zware backend-logica (bijv. `planningSecurityService.ts`, lotnummer validatie, AI Assistant services).
- `src/hooks/` - Gedeelde React hooks, waaronder Authenticatie (`useAdminAuth.ts`) en Firebase data hooks.
- `src/config/` - Firebase initialisatie (`firebase.ts`) en gecentraliseerde database paden (`dbPaths.ts`).
- `src/utils/` - Helper functies voor datumnotaties, status-checks en filtering.
- `docs/` - Systeemdocumentatie en logboeken (`CONVERSATION_SUMMARY.md`).
- `tools/` - Losse scripts voor eenmalige migraties of datamanipulatie (buiten de Vite bundel).
- `scripts/` - CI/CD en operationele scripts (zoals build verification).

---

## Belangrijkste Concepten & Lagen

### 1. UI & Orkestratie (Hubs)
De applicatie maakt gebruik van "Hubs" per specifieke machine of afdeling (bijv. `Terminal.tsx` voor wikkelstations, `BM01Hub.tsx` voor de eindinspectie).
- **Slimme Orkestrators:** Deze hubs fungeren puur als orkestrators. Ze bevatten zelf weinig tot geen bedrijfslogica.
- **Tab-Componenten:** De UI is opgedeeld in losse tab-componenten (bijv. `BM01InspectionTab.tsx`, `TerminalPlanningView.tsx`) voor maximale herbruikbaarheid en leesbaarheid.

### 2. Data Layer (Custom Hooks)
Alle interacties met Firestore (zoals `onSnapshot` listeners en queries) zijn geëxtraheerd naar gespecialiseerde data-hooks.
- **Voorbeelden:** `useTerminalData.ts`, `useBM01Data.ts`.
- **Waarom:** Dit scheidt de data-fetching van de UI, voorkomt oneindige render-loops, en zorgt ervoor dat componenten alleen herladen wanneer relevante data wijzigt.

### 3. Action Layer
Complexe acties, state-beheer voor modals en hardware-interacties leven in Action Hooks.
- **Voorbeeld:** `useTerminalActions.ts`.
- **Functie:** Bevat functies zoals `handleStartProduction`, `handleScan`, en beheert de statussen van bijbehorende modals (bijv. Release of Start Modals).

---

## Offline Tolerantie & Firestore Caching

De fabrieksvloer (vooral tablets) kan last hebben van instabiele WiFi.
- **IndexedDB Cache:** Firestore caching staat aan met een expliciete limiet van **50MB** (om browser `QuotaExceeded` crashes te voorkomen).
- **Soft Recovery:** Bij een tijdelijk verbroken verbinding laadt de app uit de cache. Er is een automatische opschoon-routine ingebouwd (`clearIndexedDb`) voor zware corrupties.

---

## Code Kwaliteit & Type Veiligheid

- **TypeScript:** Strikte TypeScript (inclusief checks via `npx tsc --noEmit`). Doel is zo min mogelijk `any` of `@ts-nocheck` overrides.
- **Linting:** ESLint zonder `/* eslint-disable */` escapes in de core logica (`npm run lint`).
- **Deployment Safety:** Deployments via `npm run deploy` voeren standaard `scripts/verify-build-output.cjs` uit. Dit script stopt de uitrol als de `dist/` map corrupt is, om "Firebase 404 Page Not Found" fouten voor eindgebruikers te voorkomen.
