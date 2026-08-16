# MES Architectuur Refactoring (Fase 1: P0-prioriteiten)

Dit document bevat de doelen en het takenlijstje om de P0-prioriteiten uit de architectuur-review uit te voeren. 
Het doel is om de codebase naar een "enterprise AI-native MES-platform" te tillen, met een focus op modulaire, type-safe code en uitgebreide kwaliteitscontroles.

## Doelstellingen

- `planningTransitionService.ts` en `planningCallables.ts` opsplitsen naar een domein-gedreven structuur.
- TypeScript uitsluitingen (`strict: true` exceptions) elimineren in de gehele applicatie.
- Gebruik van `any` reduceren (van 936 naar < 500) en vervangen door strikte types of `unknown` + type guards.
- CI Quality Gate uitbreiden voor robuustere deployments.

---

## Takenlijst

### 1. Refactoring `planningTransitionService.ts`
- `[x]` Mapstructuur aanmaken in `functions/src/services/planning/` (`application`, `domain`, `infrastructure`).
- `[x]` Domeinlogica extraheren naar `domain/PlanningState.ts` en `domain/PlanningValidator.ts`.
- `[x]` Application-acties extraheren (zoals `StartProduction.ts`, `CompleteProduction.ts`, etc.).
- `[x]` Cloud Function callables in `functions/src/callables/planningCallables.ts` opsplitsen zodat deze verwijzen naar de nieuwe subservices.
- `[x]` `functions/src/services/planningTransitionService.ts` verwijderen.

### 2. TypeScript Exclusions Elimineren
- `[x]` Bestanden verwijderen uit `exclude` array in `tsconfig.json`.
- `[x]` TS-errors oplossen in `PlanningSidebar.tsx`.
- `[x]` TS-errors oplossen in `PrintQueueAdminView.tsx`.
- `[x]` TS-errors oplossen in `WorkstationHub.tsx` (en geradpleegde hooks).
- `[x]` TS-errors oplossen in `aiService.ts`.
- `[x]` TS-errors oplossen in overige uitgesloten bestanden (zoals `AdminDrillingView`, `TimeTrackingView`, etc.).

### 3. Reductie naar < 500 `any` occurrences (~374 bereikt) (Fase 1)
- [x] `any` weghalen uit veelgebruikte interfaces (zoals Order, TrackedProduct, etc.).
- [x] API-responses standaardiseren met `unknown` of exacte types.
- [x] Globale scan uitvoeren en laaghangend fruit oplossen.

### 4. CI Quality Gate Uitbreiden
- [x] `.github/workflows/test.yml` (of soortgelijk) uitbreiden met:
  - [x] `npm run lint` (strikte regels)
  - [x] `npm run type-check`
  - [x] `npm run test` & `npm run test:rules`
  - [x] Build & E2E checks
