# TypeScript Migratieplan

## Doel
De codebase gefaseerd migreren naar TypeScript zonder productie-regressies, met de regel:
- Nieuwe code in `src/` is alleen `.ts` / `.tsx`.
- Legacy `.js` / `.jsx` mag tijdelijk blijven tot migratie afgerond is.

## Huidige status (7 mei 2026)
- Guardrail actief:
  - `npm run enforce:new-ts`
  - blokkeert nieuwe `.js`/`.jsx` in `src/` (baseline-gestuurd).
- Baselinebestand:
  - `scripts/ts-js-baseline.json`
- Migratie Fase 1 afgerond:
  - 10 utility/service bestanden gemigreerd naar `.ts`
  - type-check + build: geslaagd

## Reeds gemigreerde bestanden (Fase 1)
1. `src/services/printService.ts`
2. `src/utils/terminalOrderFilters.ts`
3. `src/utils/planningProgress.ts`
4. `src/utils/trackingHelpers.ts`
5. `src/utils/dateUtils.ts`
6. `src/utils/flangeSeriesHelper.ts`
7. `src/utils/workingTimeUtils.ts`
8. `src/utils/inventoryPaths.ts`
9. `src/utils/errorHandler.ts`
10. `src/utils/efficiencyScopedReader.ts`

## Volgende fase (Fase 2)
Migrateer 10-15 laag-risico bestanden in deze volgorde:
1. `src/repositories/*.js`
2. `src/hooks/useHasFeature.js`
3. `src/hooks/useLabelPreview.js`
4. `src/hooks/useNFCReader.js`
5. overige pure utility modules zonder JSX

## Werkwijze per bestand
1. Hernoem `.js` -> `.ts` (of `.jsx` -> `.tsx` bij JSX)
2. Fix imports met expliciete extensie
3. Voeg minimale type-annotaties toe op publieke functies
4. Run:
   - `npm run type-check`
   - `npm run build`
5. Na batch:
   - `npm run ts:refresh-baseline`
   - `npm run enforce:new-ts`

## Strikter maken (pas na stabiele Fase 2)
1. Zet `noImplicitAny` aan
2. Daarna `strictNullChecks` aan
3. Daarna volledige `strict: true`

## Hervat-commando’s
Gebruik dit bij volgende sessie om direct door te pakken:

```bash
npm run enforce:new-ts
npm run type-check
npm run build
```

En start daarna met Fase 2 uit dit document.
