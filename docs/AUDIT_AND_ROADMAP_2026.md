# Future Factory MES Audit & Verbeterroadmap (Q3/Q4 2026)

Dit document bevat het bewaarde auditrapport en de actie-roadmap voor het **Future Factory MES** systeem, opgesteld op basis van de uitgebreide externe audit van de codebase.

---

## Executive Summary & Audit Resultaten

De codebase van **FPI-Future-Factory-juli-augustus-main** is volwassen geworden met een moderne techstack (React, TypeScript, Vite, Firebase), CI/CD pipelines (GitHub Actions, Husky), en geautomatiseerde tests (Vitest, Playwright).

### Belangrijkste Auditbevindingen:
- **Code Hygiene**: ~31 bestanden met globale `/* eslint-disable */` headers.
- **Type Safety**: ~934 vermeldingen van TypeScript `any`.
- **Grote Componenten**: Meerdere React-componenten >300 regels (God-components) die opgesplitst moeten worden in UI, custom hooks en services.
- **AI-Architectuur**: AI-prompts en calls versoepelen via een gecentraliseerde `AIService.ts`.
- **MES Traceability & Resilience**: Versterken van immutable audit logs, e-signatures en offline PWA-capaciteiten.

---

## Verbeterplan & Takenlijst

### Fase 1: Code Hygiene & Type Safety (Maand 1)

#### 1.1 ESLint & Code Hygiene
- [x] Opsporen en verwijderen van de ~31 `/* eslint-disable */` headers in de codebase (reeds opgeschoond).
- [x] Herstellen van linting devDependencies (`eslint-plugin-i18next`).
- [ ] Strict ESLint regel inschakelen voor TypeScript (`@typescript-eslint/no-explicit-any`).

#### 1.2 TypeScript `any` / `unknown` Uitfasering
- [x] Inventariseren en terugbrengen van TypeScript compilatiefouten van 300 naar 54 (o.a. `aiService.ts`, `planningContext.ts`, `trackedProducts.ts`, `orderLabelSearch.ts`, `zplHelper.ts`, `pdfGenerator.ts`, `wm18ExcelImportService.ts`).
- [ ] Definieren van ontbrekende interfaces en types in de resterende 11 componenten.
- [ ] Resterende 54 type-fouten oplossen.

#### 1.3 God-Components Refactoring (>300 regels)
- [ ] **`TerminalComponent.tsx`**: UI-rendering scheiden van datafetching en business logic (`useTerminalData`, `useTerminalActions`).
- [ ] **`BM01InspectionTab.tsx`**: Inspectie-formulieren en logica scheiden in losse subcomponenten.
- [ ] **`QualityControlTab.tsx`**: QC-acties en tabellen ontkoppelen van de hoofd-container.
- [ ] **`AdminDashboard.tsx`**: Widget-logica verplaatsen naar modulaire widget-componenten.
- [ ] **`PlanningCalendar.tsx`**: Kalender-grid rendering scheiden van scheduling logica.
- [ ] **`AIChatbot.tsx`**: Prompt-opbouw en API-calls verplaatsen naar `AIService.ts`.

---

### Fase 2: CI/CD, Testing & Security (Maand 2)

#### 2.1 Testdekking Verhogen
- [ ] **Vitest Unit Tests**: Unit-tests uitbreiden voor services en custom hooks (`usePlanning`, `useBM01Data`, `efficiencyCalculator`) naar >85% dekking.
- [ ] **Playwright E2E Tests**: Uitbreiden van end-to-end testen voor kritieke operator flows (Terminal, BM01 inspectie, QC vrijgave).
- [ ] **Coverage Reporting**: CI/CD pipeline uitbreiden met automatische test-coverage controle.

#### 2.2 Security & Code Quality Pipelines
- [ ] **CodeQL / SonarQube**: Toevoegen van SonarCloud of CodeQL stappen in GitHub Actions.
- [ ] **Firestore Security Rules Audit**: Controleren en aanscherpen van `firestore.rules`.
- [ ] **Dependency Scans**: Automatische Dependabot scans inschakelen.

---

### Fase 3: Prestatie, AI Architectuur & MES Uitbreidingen (Maand 3)

#### 3.1 Prestaties & Bundel-optimalisatie
- [ ] **Code Splitting (React.lazy)**: Implementeren van lazy loading op router-niveau.
- [ ] **Caching & Re-renders**: Toepassen van `React.memo` / `useMemo` op realtime Firebase listener streams.
- [ ] **Firestore Optimisatie**: Batch-queries en indexing optimaliseren voor document-reads.

#### 3.2 AI-Architectuur Centralisatie
- [ ] **`AIService.ts`**: Centraliseren van alle LLM API-calls, prompt templates en error handling in één service.
- [ ] **Rate Limiting & Cost Logging**: Bijhouden en limiteren van AI-aanroepen.

#### 3.3 MES Functionaliteit & Audit Trails
- [ ] **Audit Trail Logging**: Borgen dat kritieke acties worden vastgelegd in een immutable audit log.
- [ ] **Offline Fallback / PWA Resilience**: Versterken van de offline-capaciteit van de Terminal en inspectieschermen.
