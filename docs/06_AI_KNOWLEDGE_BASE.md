# 6. AI Knowledge Base & Codebase Map

Dit document fungeert als het "brein" en referentiekader voor Antigravity en andere AI-assistenten die aan dit project werken. Het beschrijft in detail de architectuur, de relaties tussen modules en de best practices binnen de `src/` directory.

---

## Directory Structuur Overzicht (`/src`)

De applicatie volgt een modulaire, domeingedreven opbouw:

### 1. `components/` (React UI)
- **`admin/`**: Systeemconfiguratie, gebruikersbeheer (`AdminUsersView.tsx`), matrix configurator en de documentatie portals (`ProjectStructureExpertView.tsx`, `LiveDocumentationView.tsx`).
- **`digitalplanning/`**: Het kloppend hart van de fabrieksvloer.
  - Bevat de interfaces voor operators: `WorkstationHub.tsx`, `Terminal.tsx` (orderlijsten).
  - Acties worden veelal via modals afgehandeld (in de `modals/` submap), zoals `InspectionModal.tsx`, `ProductionStartModal.tsx` of `TraceModal.tsx`.
- **`teamleader/`**: Dashboards specifiek voor afdelingshoofden (`TeamleaderDashboard.tsx`, `TeamleaderGanttView.tsx`).
- **`printer/`**: Alles rondom ZPL en label-printing: queues (`PrintQueueAdminView.tsx`), previews (`LabelVisualPreview.tsx`).
- **`qc/`**: Kwaliteitscontrole en lab-metingen (`QCHub.tsx`).
- **`products/` & `personnel/` & `planning/`**: Modules voor specifieke resources en entiteiten.

### 2. State & Data Logica
- **`contexts/`**: Bevat de React Context Providers voor globale UI states, zoals `NotificationContext.tsx` en `BackgroundTaskContext.tsx`.
- **`hooks/`**: Custom React hooks voor herbruikbare logica. Zeer cruciaal voor data-fetching, bijvoorbeeld `useProductsData.ts`, `useAdminAuth.ts` of `useTerminalData.ts`.
- **`repositories/`**: Abstraheert de communicatie met Firestore. In plaats van ruwe `doc(db, ...)` calls in componenten te doen, wordt data via repositories (`planningRepository.ts`, `inventoryRepository.ts`) gelezen en weggeschreven.

### 3. Backend & Services
- **`services/`**: Externe of complexe diensten.
  - `aiService.ts`: Integratie met Google Vertex/Gemini AI.
  - `printService.ts`: Directe printeraansturing via Cloud of lokaal netwerk.
  - `inforSyncService.ts`: Sync logica met het externe ERP systeem (Infor LN).
- **`utils/`**: De "engine room" met rekenlogica en pure functies.
  - OEE berekeningen (`efficiencyCalculator.ts`).
  - Automatisering van workflows (`automationEngine.ts`).
  - Genereren van documenten (`pdfGenerator.ts`, `zplHelper.ts`).

### 4. Configuratie
- **`config/`**: Firebase setup (`firebase.ts`) en alle dynamische database paden (`dbPaths.ts`).
- **`lang/`**: Alle `i18n` vertalingsbestanden (`nl.ts`, `en.ts`). Hardcoded tekst in componenten is ten strengste verboden.
- **`types/`**: TypeScript definities (`index.ts`) voor stricte type-checking.

---

## Kernconcepten & Relaties

### A. State Management Filosofie
- **Locale UI State:** Wordt via `useState` in de componenten zelf gehouden.
- **Globale Data State:** Wordt veelal beheerd via **Zustand** (bijv. `WorkstationStore.ts`, `useWorkstationStore.ts` in `digitalplanning/`). Dit voorkomt overbodige re-renders en prop-drilling in de complexe Workstation Hubs.

### B. Het Print Proces
Wanneer een gebruiker een label print:
1. Een component roept de printfunctie aan.
2. `utils/zplHelper.ts` of `labelHelpers.tsx` vertaalt de data naar ZPL (Zebra Programming Language).
3. `printer/printRouting.ts` beslist op basis van het huidige workstation of de order naar welke fysieke Zebra printer de data moet.
4. `printer/usbPrintService.ts` stuurt het direct via de browser WebUSB API, of er wordt een wachttij in Firestore aangemaakt die door een Node.js worker/print bridge wordt opgepakt.

### C. Artificial Intelligence Integratie
Het MES systeem is "AI-First".
- De *kennis* (Grounding) van het bedrijf zit in `data/aiContext.ts`.
- De *prompts* zitten in `data/aiPrompts.ts`.
- Wanneer de operator een vraag stelt via de AI module, zorgt `services/aiService.ts` voor de streaming call naar Gemini, met toevoeging van de context-data zodat de AI niet hallucineert over fabrieksprocessen.

---

## Instructies voor AI (Antigravity Rules)

1. **Begrijp de flow:** Bij wijzigingen in het primaire proces (Start/Stop order, Keuren), modificeer niet direct de UI, maar zoek de bijbehorende logica op in `utils/workstationLogic.ts` of de bijbehorende modals in `components/digitalplanning/modals/`.
2. **Datalaag respecteren:** Voeg geen nieuwe collections toe aan Firestore zonder `config/dbPaths.ts` en de bijbehorende TypeScript interfaces (in `types/index.ts`) bij te werken.
3. **i18n Strictness:** Bij het toevoegen van UI-elementen:
   ```tsx
   // FOUT:
   <button>Keur Order Goed</button>
   
   // GOED:
   const { t } = useTranslation();
   <button>{t('qc.approveOrder', 'Keur Order Goed')}</button>
   ```
4. **Architectuur intact houden:** Voorkom "Spaghetti" code. Als een functionaliteit groeit, verplaats data-processing logica naar `utils/` en externe-API logica naar `services/`. Componenten moeten zo 'dom' mogelijk zijn.
