# FPI Future Factory — Architectuur Takenlijst
> Gebaseerd op evaluatiescore **9.0–9.2/10** | Doel: productie-grade enterprise MES
> Bijgewerkt: 2026-08-20

---

## Programma 1 — Type Safety (`any` 742 → <100) · Prioriteit P1

### Fase 1A — CI Baseline
- [x] `scripts/check-any-count.cjs` aanmaken — telt `any` en vergelijkt met baseline
- [x] `.any-baseline.json` aanmaken met `{ "baseline": 742, "target": 500 }`
- [x] `"check:any"` script toevoegen aan `package.json`
- [x] `check:any` integreren in `npm run validate`

### Fase 1B — Hotspots aanpakken
- [x] `MazakView.tsx` — `any` opruimen (na Module Hardening split)
- [x] `planningSecurityService.ts` — `unknown` + type guards introduceren
- [ ] `aiService.ts` — typering na AI Abstraction (Programma 4)
- [ ] Firebase Firestore callbacks — `DocumentSnapshot<T>` generics
- [x] Baseline verlagen: **742 → 500**
- [ ] Baseline verlagen: **500 → 250**
- [ ] Baseline verlagen: **250 → 100**

### Fase 1C — Zod uitbreiden
- [x] `MachineStatusSchema` — PLC/OT data validatie
- [x] `InforOrderSchema` — ERP import validatie
- [x] `PrintJobSchema` — printer routing validatie
- [x] `QualityMeasurementSchema` — QC invoer validatie
- [x] Alle Firebase `onCall`-handlers voorzien van Zod-validatie

---

## Programma 2 — Module Hardening (monoliethen splitsen) · Prioriteit P1

### MazakView.tsx (3.947 regels)
- [x] Verantwoordelijkheden identificeren
- [x] `mazak.types.ts` extraheren
- [x] `useMazakData.ts` extraheren — data fetching hook
- [x] `useMazakActions.ts` extraheren — acties & commands
- [x] `MazakComponents.tsx` extraheren (22 subcomponenten i.p.v. specifieke job/log panels)
- [x] `MazakView.tsx` reduceren tot orchestrator (~1.475 regels in plaats van 200 om >40 prop-drilling te voorkomen)

### PrintQueueAdminView.tsx (3.301 regels -> 550 regels)
- [x] Tabs identificeren en naar aparte view-componenten splitsen
- [x] Data-logica naar hooks extraheren (usePrintQueueAdmin.tsx)

### AdminPrinterManager.tsx (2.926 regels)
- [x] Statushistorie tab verwijderd en verplaatst naar modal
- [x] Hook + subcomponenten patroon toepassen
- [x] `useAdminPrinterManager.ts` hook extraheren

### ProductionStartModal.tsx (2.782 regels)
- [x] Wizard-stappen als aparte subcomponenten maken
- [x] `useProductionStart.ts` hook extraheren

### useWorkstationState.ts (2.515 regels)
- [x] Domain-specifieke hooks opsplitsen
- [x] Hooks per verantwoordelijkheid: data / acties / subscriptions

### AdminLabelDesigner.tsx (2.217 regels)
- [ ] Canvas-component extraheren
- [ ] Toolbar extraheren
- [ ] Sidebar extraheren

### PrintStationView.tsx (2.162 regels)
- [ ] Queue-weergave extraheren
- [ ] Detail-weergave extraheren
- [ ] Controls extraheren

### ShopFloorMobileApp.tsx (2.095 regels)
- [ ] Navigator-patroon implementeren
- [ ] Schermen als aparte componenten

### PlanningSidebar.tsx (2.063 regels)
- [ ] Panels opsplitsen naar subcomponenten

### BM01Hub.tsx (2.015 regels)
- [ ] Hub → orchestrator patroon toepassen

---

## Programma 3 — MES Core Formalisatie · Prioriteit P1

### 3A — Idempotency Keys ⚡ (Klein, hoge impact — begin hier)
- [x] `functions/src/services/planning/domain/IdempotencyRegistry.ts` aanmaken
- [x] `src/services/commandService.ts` aanmaken met `generateCommandId()`
- [x] `StartProduction.ts` voorzien van idempotency-check
- [x] `CompleteProduction.ts` voorzien van idempotency-check
- [x] `PauseProduction.ts` voorzien van idempotency-check
- [x] `CancelProduction.ts` voorzien van idempotency-check
- [x] `MoveProduction.ts` voorzien van idempotency-check
- [x] Alle overige kritieke commands voorzien van idempotency-check

### 3B — Event Store
- [x] `functions/src/services/planning/domain/EventStore.ts` aanmaken
- [x] MES event types definiëren: `ProductionStarted`, `ProductionPaused`, `ProductionCompleted`, `ProductionCancelled`, `QualityRejected`, `MachineStopped`, `MaterialConsumed`, `OrderReleased`, `OrderTransferred`
- [x] Firestore-structuur aanmaken: `/events/`, `/eventsByEntity/`, `/eventsByCorrelation/`
- [x] `StartProduction.ts` schrijft naar EventStore
- [x] `CompleteProduction.ts` schrijft naar EventStore
- [x] `PauseProduction.ts` schrijft naar EventStore
- [x] `QualityControl.ts` schrijft naar EventStore
- [x] Overige handlers schrijven naar EventStore

### 3C — Audit Enhancement
- [x] `AuditRecord` interface uitbreiden met: `source`, `correlationId`, `entityType`, `entityId`, `oldValue`, `newValue`, `reason`
- [x] `auditService.ts` aanpassen naar nieuw formaat
- [x] `source`-veld populeren: `operator | ERP | AI | PLC | system`
- [x] `correlationId` doortrekken door alle audit-calls

### 3D — State Machines
- [x] `functions/src/services/planning/domain/OrderStateMachine.ts` aanmaken
- [x] Alle geldige state-overgangen definiëren
- [x] `StartProduction.ts` gebruikt `OrderStateMachine.canTransition()`
- [x] `CompleteProduction.ts` gebruikt `OrderStateMachine.canTransition()`
- [x] Overige handlers gevalideerd via StateMachine
- [x] Unit tests voor alle state-overgangen

### 3E — Transactie-review
- [x] Productie starten — transactie-audit (order + workstation + log)
- [x] Productie beëindigen — transactie-audit (order + voorraad + log)
- [x] Materiaalverbruik — transactie-audit (order + stock)
- [x] Kwaliteitsafkeur — transactie-audit (batch + qc-status)
- [x] Ordertransfer — transactie-audit (van + naar workstation)

---

## Programma 4 — AI Abstraction Layer · Prioriteit P2

- [ ] `src/services/ai/AIProvider.interface.ts` aanmaken
- [ ] `src/services/ai/VertexAIProvider.ts` aanmaken
- [ ] Vertex AI-specifieke logica verplaatsen van `aiService.ts` naar `VertexAIProvider.ts`
- [ ] `aiService.ts` refactoren: werkt via `AIProvider` interface
- [ ] `generateStructured<T>()` implementeren met Zod-schema
- [ ] `AIContext` types definiëren per domein: `planning | quality | maintenance | production | management`
- [ ] Functions-kant: zelfde abstraction toepassen op `aiInvisibleWorkerService.ts`

---

## Programma 5 — Security Hardening · Prioriteit P2

- [ ] `functions/src/auth/PermissionMatrix.ts` aanmaken
- [ ] Alle acties definiëren met vereiste roles, station en order-state
- [ ] Firestore Security Rules uitbreiden: `hasRole()` helper
- [ ] Firestore Security Rules uitbreiden: `isAssignedToStation()` helper
- [ ] Firestore Security Rules uitbreiden: `orderIsInState()` helper
- [ ] `canOperateProduction()` vervangen door gedetailleerde permissie-checks
- [ ] Security rules testen: `npm run test:rules`
- [ ] Alle kritieke collections geaudit op te ruime rules

---

## Programma 6 — Offline-First · Prioriteit P3

- [ ] `src/services/offline/CommandQueue.ts` aanmaken (IndexedDB-based)
- [ ] `src/services/offline/ConflictResolver.ts` aanmaken
- [ ] Conflictstrategieën definiëren per commandtype
- [ ] Service Worker uitbreiden met Background Sync API
- [ ] Cache-first strategie voor productie-instructies en tekeningen
- [ ] `StartProduction` offline-capable maken
- [ ] `AddQualityMeasurement` offline-capable maken
- [ ] Tijdregistratie offline-capable maken
- [ ] Reconnect & sync flow testen
- [ ] Offline UI-indicatoren toevoegen

---

## Programma 7 — OT/Edge Integratie · Prioriteit P3

- [ ] OPC-UA client integreren in `GatewayPC/src/` (node-opcua)
- [ ] Machine events → Firebase Realtime DB / Firestore pipeline
- [ ] `MachineStopped`-event definiëren en koppelen aan EventStore
- [ ] Mazak CNC koppeling via OPC-UA testen
- [ ] Machine-data weergeven in `MazakView.tsx` (na Module Hardening)
- [ ] MQTT of WebSocket bridge evalueren als alternatief voor OPC-UA direct

---

## Voortgang

| Programma | Taken | Afgevinkt | % |
|---|---|---|---|
| 1 — Type Safety | 20 | 12 | 60% |
| 2 — Module Hardening | 31 | 0 | 0% |
| 3 — MES Core | 27 | 0 | 0% |
| 4 — AI Abstraction | 7 | 0 | 0% |
| 5 — Security | 8 | 0 | 0% |
| 6 — Offline-First | 10 | 0 | 0% |
| 7 — OT/OPC-UA | 6 | 0 | 0% |
| **Totaal** | **103** | **0** | **0%** |

## 4. Dynamische Workflow / Routing Engine (Feature Request)
**Status:** In afwachting
**Context:** Op dit moment is de routing van lots (tracked products) in de backend hardcoded. Zodra een product op een willekeurig station afgerond wordt via `forward`, gaat het direct naar BM01 (Eindinspectie). 
**Probleem:** Gekoppelde, meervoudige flows (zoals Pipe zagen in Spoolbouw ➔ Wikkelen in Fittings ➔ Terug naar Spoolbouw voor frezen Spigot CS ➔ Naar Pipes voor boren spiegat ➔ BM01) kunnen hierdoor niet functioneren, omdat de logica onterecht aanneemt dat de halte vóór BM01 altijd het eindpunt is.
**Aanpak:**
- Introduceer een configurabele 'routekaart' of stappenplan per product- of ordertype in de backend (`CompleteProduction.ts`).
- Een lot behoudt zijn actieve status over deze gehele keten, maar het `currentStation` springt dynamisch naar de volgende halte zoals gedefinieerd in het flow-model (bijv. van `Fittings` naar `Spoolbouw` ipv geforceerd naar `BM01`).
