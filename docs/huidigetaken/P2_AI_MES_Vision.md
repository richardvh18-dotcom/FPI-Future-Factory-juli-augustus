# Architectuurvisie: AI-Native Decision Support MES (P2)

De transitie van een "Dashboard-MES" (waarbij de mens data zoekt en conclusies trekt) naar een "Decision-Support MES" (waarbij AI de data analyseert, trends herkent en acties voorstelt) is de ultieme gamechanger voor dit platform.

Hier is de technische blauwdruk hoe we P2-doelen 9 (AI Production Copilot) en 10 (Closed-loop optimization) gaan realiseren, zodra de huidige refactoring (P0/P1) een solide basis heeft gelegd.

---

## 9. AI Production Copilot (De Analytische Engine)

In plaats van een simpele RAG-chatbot (Retrieval-Augmented Generation) die alleen statische PDF's kan lezen, bouwen we een **Context-Aware Agentic Copilot**.

### Use Case
**Operator/Planner vraagt:** *"Waarom lopen we vandaag 14% achter op planning?"*

### Technische Flow
1. **Intent Recognition:** De LLM herkent dat dit een kwantitatieve analyse-vraag is.
2. **Data Orchestration (Tool Calling):** De AI roept via de backend gerichte query-tools aan:
   - `getProductionMetrics(today)` -> Ziet 14% vertraging.
   - `getDowntimeEvents(today)` -> Vindt 2 uur stilstand op de BM01.
   - `getQualityRejects(today)` -> Vindt bovengemiddelde uitval door "Lekkage" bij product X.
   - `getPersonnelLog(today)` -> Ziet dat er een uitzendkracht op die machine stond.
3. **Synthesis:** De AI combineert deze ruwe datapunten.
4. **Onderbouwde Conclusie:** *"De achterstand komt primair door BM01 (2u stilstand) en hoge uitval bij product X door lekkage. Dit gebeurde tijdens de shift van een nieuwe operator. Advies: Controleer de afstelling van BM01 voor product X."*

### Benodigde Architectuur
- **Vector Database / Graph Database:** Naast Firestore hebben we een model nodig dat relaties (Operator X werkte aan Machine Y tijdens Order Z met Fout W) snel inzichtelijk maakt.
- **Function Calling Framework:** Onze huidige `aiService.ts` moet worden uitgebreid met native Firebase Cloud Functions die de AI als gereedschap kan aanroepen.

---

## 10. Closed-Loop Optimization (De Heilige Graal)

Dit is het concept waarbij het systeem leert van zijn eigen adviezen en daadwerkelijk kan sturen.

### De Loop (Observe -> Analyze -> Recommend -> Approve -> Execute -> Learn)
1. **Observe (Event Stream):** Machine-data en operator-input komen binnen als events (bijv. "Order duurt 30% langer dan gepland").
2. **Analyze (AI Cron Job):** Een AI-worker analyseert de wachtrij op de achtergrond.
3. **Recommend:** De AI genereert een *"Optimization Proposal"*: *"Order 456 loopt uit. Als we Order 457 verplaatsen naar Machine 2, halen we de levertijd voor beide."*
4. **Approve (Human-in-the-Loop):** De planner ziet dit voorstel in de `PlanningSidebar` als een "💡 AI Suggestie" met één klik: **[Accepteer en herplan]**.
5. **Execute:** Als de planner accepteert, triggert het systeem de `planningTransitionService` (die we nu in P0 modulair aan het maken zijn!) om de database aan te passen.
6. **Learn:** Het systeem meet of de geherplande levertijd ook echt gehaald is. Zo ja, wordt het AI-model gefinetuned (of de prompt-context verrijkt) met deze "success-case".

### Benodigde Architectuur
- **Event-Driven Pub/Sub:** De events moeten asynchroon door AI workers worden opgepakt (bijv. via Google Cloud Tasks of Pub/Sub).
- **Proposal Data Model:** Een nieuwe collectie `OptimizationProposals` in Firestore.
- **Decoupled State Machine:** De reden dat ik in P0 de `planningTransitionService` opsplits in strikte modules (zoals `MoveProduction.ts`), is exact zodat een AI deze functies op termijn *veilig* als tools kan aanroepen, met de planner slechts als goedkeurder!

## Volgende Stappen / Road to P2

Om dit mogelijk te maken, MOETEN we de huidige prioriteiten eerst afronden:
1. **P0 (Huidige fase):** Typesafety en modulaire services. Als de AI straks geautomatiseerd mutaties gaat voorstellen of doorvoeren, moeten we 100% zeker zijn dat de invoer veilig, gevalideerd en strikt getypeerd is.
2. **P1:** Event-driven architecture (Event Sourcing). In plaats van records domweg te updaten, slaan we immutable events op (`ProductionStarted`, `MachineFaulted`). De AI heeft deze tijdslijnen nodig om analyses uit te voeren.
3. **P2:** Integratie van de Function Calling Copilot en de Proposal UI in het planningboard.
