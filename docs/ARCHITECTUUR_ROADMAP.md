# Architectuur & Optimalisatie Plan (Code Review Reactie)

Dit document beschrijft hoe ik als AI-assistent de aangedragen zwakke punten en aanbevelingen uit de code review kan aanpakken. Omdat dit grote architecturale wijzigingen betreft, is het verstandig om ze in fases uit te voeren. 

Hieronder volgt een gedetailleerd actieplan per onderwerp.

## 1. State Management & Performance
**Probleem:** Te veel React Contexts (`NotificationContext`, etc.) die onnodige re-renders veroorzaken.
**Aanpak:**
- Ik zie dat `zustand` al deels geïnstalleerd en in gebruik is in deze bestanden, maar de naamgeving en architectuur leunen nog op React Context wrappers.
- **Actie:** Ik kan de Context Providers (`NotificationContext.tsx`, `BackgroundTaskContext.tsx`, `ProgressOperationContext.tsx`) volledig strippen van React Context en ze ombouwen tot zuivere Zustand hooks (bijv. `useNotificationStore`). Dit verwijdert de boilerplate uit `App.tsx` en garandeert dat componenten alleen re-renderen als de specifieke state die ze gebruiken verandert.

## 2. Firebase Kosten & Optimalisatie (Aggregatie)
**Probleem:** Zware NoSQL queries voor planning overzichten en heatmaps.
**Aanpak:**
- **Actie:** In plaats van duizenden order-documenten aan de client-side in te laden via `usePlanningData.ts`, kan ik Firebase Cloud Functions triggers (bijv. `onWrite` op de planning collectie) schrijven die automatisch een 'geaggregeerd' samenvattingsdocument (bijv. `planning_summary/daily`) up-to-date houden. De client leest dan slechts 1 document, wat de Firebase kosten drastisch verlaagt en de load-time van de Gantt Chart verbetert.

## 3. Webhooks Idempotentie & Dead Letter Queue (DLQ)
**Probleem:** Infor ION webhooks kunnen falen, dubbel binnenkomen, of onbereikbaar zijn.
**Aanpak:**
- **Actie 1 (Idempotentie):** Ik kan de `webhook.ts` Cloud Function zo aanpassen dat deze eerst het inkomende unieke Infor Message ID opslaat in een `processed_webhooks` collectie met een transactie. Komt hetzelfde ID nog eens binnen, dan wordt de verwerking direct overgeslagen.
- **Actie 2 (DLQ):** Als een verwerking stukloopt (bijv. validatiefout of ontbrekende data), vang ik dit af in een globale `catch` en schrijf ik de originele payload weg naar een `dlq_webhooks` Firestore collectie. We kunnen dan een simpele UI bouwen (in de Admin sectie) om deze gefaalde payloads in te zien en eventueel te "re-playen".

## 4. Hardware Fallbacks (WebUSB)
**Probleem:** `usbPrintService` werkt niet op iPads (Safari).
**Aanpak:**
- **Actie:** Ik kan een `navigator.usb` feature check inbouwen in de print interfaces. Als WebUSB niet wordt ondersteund, toont de UI een duidelijke, gebruiksvriendelijke foutmelding ("USB Printen wordt niet ondersteund op dit apparaat, gebruik een Chromium browser of stuur naar een netwerkprinter").

## 5. AI Rate Limiting & Cloud Function Cold Starts
**Probleem:** Geen budgetbeheer voor Gemini en trage opstarttijden voor belangrijke functies.
**Aanpak:**
- **Actie 1 (Rate Limiting):** In de zojuist gerefactorde `src/services/ai/cloudFunctionProxies.ts` kan ik een lokale `localStorage` timer of een Firestore limiet inbouwen die het aantal tokens/calls per uur bijhoudt en blokkeert als een operator de AI te veel "spamt".
- **Actie 2 (Cold Starts - KOSTENBEWUST):** `minInstances: 1` instellen voorkomt cold starts, maar veroorzaakt **hoge 24/7 compute kosten** per functie. Omdat dit in het verleden al voor hoge kosten heeft gezorgd, kunnen we betere alternatieven inzetten:
  - **Optimistic UI:** De UI reageert direct (bijv. "Printopdracht verstuurd") terwijl de Cloud Function op de achtergrond mag "cold starten".
  - **Single API Endpoint (Monolith Lambda):** We kunnen meerdere kleine functies samenvoegen tot 1 grotere Express-achtige functie. Dan hoeft er maar 1 container warm te blijven die al dit verkeer afhandelt, wat veel cold starts voorkomt zónder vaste `minInstances` kosten.
  - **Warm-up Ping:** Een Cloud Scheduler die de belangrijkste functie elke 15 minuten een "ping" stuurt. Dit kost vrijwel niets vergeleken met `minInstances: 1`.

## 6. Strikte Beveiliging (Firestore Rules)
**Probleem:** Firestore rules moeten bulletproof zijn voor fabrieksoperaties.
**Aanpak:**
- **Actie:** Ik kan `firestore.rules` volledig herschrijven om Role Based Access Control (RBAC) af te dwingen op basis van custom claims (bijv. `request.auth.token.role == 'admin'`).

---

> [!IMPORTANT]
> **User Review Required**
> Deze punten zijn allemaal perfect uitvoerbaar voor mij als AI-assistent. Omdat we niet alles tegelijk kunnen doen zonder de stabiliteit in gevaar te brengen, stel ik voor dat we prioriteiten stellen.

## 7. Firebase Reads Optimalisatie (Hot Loops voorkomen)
**Probleem:** Uit billing-analyse blijkt dat er 160.000 reads per dag worden gegenereerd op een lege database (0 documenten). Omdat `.get()` en `.getDocs()` voornamelijk veilig in utility scripts zitten, wordt dit extreem hoge verbruik vrijwel zeker veroorzaakt door een **React 'Hot Loop'**.
Specifiek: de applicatie heeft ruim 122 actieve `onSnapshot` listeners. Als één van deze listeners in een `useEffect` zit waarbij de afhankelijkheden (dependency array) onstabiel zijn (bijv. een object of array die bij elke render opnieuw wordt aangemaakt), breekt React de Firebase verbinding constant af en start deze direct opnieuw op. Elke herstart op een lege collectie kost 1 read. Dit gebeurt dan meerdere keren per seconde.
**Aanpak:**
- **Actie 1 (Lokale Monitoring):** Gebruik de Firebase Emulator Suite (tabblad Requests) of lokale `console.count` interceptors in de code om visueel in de browser te zien bij welk dashboard de teller op hol slaat.
- **Actie 2 (Code Analyse):** Doorzoek de componenten die `onSnapshot` gebruiken (zoals `Terminal`, `WorkstationHub` of hooks zoals `usePlanningData`) en repareer instabiele `useEffect` dependencies (gebruik `useMemo` voor arrays/objecten).

## Open Vragen voor Jou
1. Welk van deze 7 blokken is momenteel het meest urgent voor jou (bijv. State Management of de Infor Webhooks)?
2. Zullen we met één specifiek punt beginnen, daar een gedetailleerd plan voor maken, en die eerst volledig implementeren?
