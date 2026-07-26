# Component Refactor Plan

## Doel

De componenten in de app worden stap voor stap opgesplitst tot kleinere, leesbare en beter onderhoudbare stukken. De richtlijn is:

- ideaal: 50-150 regels per component
- acceptabel: tot 200 regels
- waarschuwing: boven 300 regels is meestal een teken dat een component te veel verantwoordelijkheden heeft

## Splits-signalen

Een component wordt een kandidaat voor refactoring als:

- het zowel data-ophaling, state-management en JSX rendert
- het meerdere UI-delen bevat die los van elkaar kunnen worden hergebruikt
- er veel props door meerdere lagen heen worden gestuurd
- er veel lokale state of effect-hooks aanwezig zijn

## Standaard aanpak per component

1. Bepaal de kernresponsibiliteit.
2. Splits UI in presentational onderdelen zoals header, card, toolbar, tabel of modal-sectie.
3. Verplaats data- of berekeningslogica naar een kleine helper of custom hook.
4. Laat de hoofdcomponent alleen de orchestratie over.
5. Verifieer met linting, typecheck en relevante tests.

## Huidige voortgang

De volgende refactors zijn al gestart of afgerond:

- [src/components/planning/TimeTrackingView.tsx](src/components/planning/TimeTrackingView.tsx) – header is afgesplitst naar een eigen component.
- [src/components/digitalplanning/PlanningSidebar.tsx](src/components/digitalplanning/PlanningSidebar.tsx) – order cards zijn opgesplitst.
- [src/components/admin/PrintQueueAdminView.tsx](src/components/admin/PrintQueueAdminView.tsx) – header is afgesplitst.

## Refactor backlog

### P1 – eerst aanpakken

1. [src/components/digitalplanning/MazakView.tsx](src/components/digitalplanning/MazakView.tsx)
   - Reden: zeer groot en waarschijnlijk meerdere subsystemen in één view.
   - Voorstel: split in een container + header + status/toolbar + detailpanelen.

2. [src/components/digitalplanning/WorkstationHub.tsx](src/components/digitalplanning/WorkstationHub.tsx)
   - Reden: centrale hub met veel UI en state.
   - Voorstel: split in hub-container, station cards, sidebar/details en toolbar.

3. [src/components/admin/AdminReportsView.tsx](src/components/admin/AdminReportsView.tsx)
   - Reden: filtering, metrics, export en tabellogica zijn gemengd.
   - Voorstel: split in filterbar, summary cards, results table en export actions.

### P2 – daarna aanpakken

4. [src/components/planning/ShopFloorMobileApp.tsx](src/components/planning/ShopFloorMobileApp.tsx)
   - Reden: veel state, meerdere views en modal-achtige secties.
   - Voorstel: split in view-switcher, planning list, scanner panel en issue modal.

5. [src/components/planning/CapacityPlanningView.tsx](src/components/planning/CapacityPlanningView.tsx)
   - Reden: data-ophaling, filters en visualisatie zijn sterk verweven.
   - Voorstel: split in filter controls, summary metrics en chart/table sections.

6. [src/components/planning/GanttChartView.tsx](src/components/planning/GanttChartView.tsx)
   - Reden: grote planner met veel drag/drop-state en meerdere lagen van UI.
   - Voorstel: split in toolbar, timeline, lane rendering en drag-state hook.

7. [src/components/digitalplanning/modals/ProductionStartModal.tsx](src/components/digitalplanning/modals/ProductionStartModal.tsx)
   - Reden: grote modal met veel form- en statuslogica.
   - Voorstel: split in form sections, footer actions en status summary.

### P3 – vervolgrefactors

8. [src/components/admin/AdminPrinterManager.tsx](src/components/admin/AdminPrinterManager.tsx)
   - Reden: beheerview met lijst, details en acties in één bestand.
   - Voorstel: split in header, printer list, detail paneel en action bar.

9. [src/components/admin/AdminUsersView.tsx](src/components/admin/AdminUsersView.tsx)
   - Reden: lijst, filters en beheeracties zijn sterk samengevoegd.
   - Voorstel: split in filter toolbar, user table en detail/action panel.

10. [src/components/admin/AdminLabelDesigner.tsx](src/components/admin/AdminLabelDesigner.tsx)
    - Reden: grote configuratie- en editorview.
    - Voorstel: split in canvas/editor, property panel en preview paneel.

## Prioritering

- Eerst: grote views met veel UI en state.
- Daarna: modals en detailviews met meerdere secties.
- Tot slot: beheerviews en kleinere maar nog steeds te dikke componenten.

## Kwaliteitscheck per refactor

Na elke split moet worden gecontroleerd:

- linting zonder nieuwe fouten
- typecheck of relevante tests
- gedrag blijft gelijk
- componenten zijn kleiner en duidelijker dan voorheen
