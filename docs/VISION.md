# Visie: AI-First MES (Manufacturing Execution System)

Dit document beschrijft de lange-termijn strategische visie voor de FPI Future Factory. Waar de initiële fases draaien om digitalisatie (papier naar tablet) en modularisatie (technische schuld opruimen), richt de toekomstige fase zich op **onderscheidend vermogen** door middel van een AI-first benadering.

We transformeren van een **System of Record** (registreren wat er gebeurt) naar een **System of Intelligence** (voorspellen, adviseren en optimaliseren).

## De Fundering (Huidige Status)
Om een AI-first MES te bouwen, is een robuuste fundering essentieel:
- **Gestructureerde Data:** Strikte TypeScript interfaces in plaats van `any`, zodat een AI-model de datastructuur exact begrijpt.
- **Modulaire Architectuur:** Hub-and-Spoke architectuur zorgt ervoor dat sensordata, planning en kwaliteitscontrole gescheiden maar koppelbaar zijn.
- **Realtime Infrastructuur:** Firestore biedt de basis voor instant-updates (vereist voor een Digital Twin).

## De 10 Pijlers van de Future Factory

### 1. Digital Twin
Een live, interactieve digitale kopie van de fabrieksvloer.
- **Wat:** In plaats van "Machine draait", toont de twin: `Status: Running | OEE: 82% | Temp: 43°C | Verwachte eindtijd: 14:22`.
- **Techniek:** Firebase realtime listeners gekoppeld aan een visuele canvas of SVG-plattegrond in React.

### 2. AI Copilot voor Operators
Een proactieve assistent in plaats van een passieve chatbot.
- **Wat:** Beantwoordt complexe vragen zoals "Waarom is lijn 2 trager?" met data-gedreven inzichten (storingen, omsteltijd, harsverbruik) en geeft direct aanbevelingen.
- **Techniek:** LLM (Large Language Model) geïntegreerd met Firestore data-aggregaties.

### 3. Predictive Maintenance
Voorspellend in plaats van reactief.
- **Wat:** "89% kans dat lager A binnen 8 dagen uitvalt. Advies: onderhoud plannen vrijdag 16:00."
- **Techniek:** Machine Learning modellen getraind op historische storingen, cyclustijden en sensordata.

### 4. AI Production Planner
Intelligente orchestratie van productieorders.
- **Wat:** Optimaliseert automatisch de planning met één druk op de knop op basis van snelste levertijd, minste omstellingen, en hoogste OEE.
- **Techniek:** AI algoritmes die rekening houden met de routing-dependencies en realtime machine-beschikbaarheid.

### 5. Realtime OEE Intelligence
Niet alleen tonen, maar verklaren.
- **Wat:** Splitsing van verlies in exacte root-causes (wachten, omstellen, storing, afkeur) én de AI vertelt welke 3 acties morgen het meeste opleveren.
- **Techniek:** Continue data-aggregatie via Cloud Functions gecombineerd met AI-analyse.

### 6. Root Cause AI
Versnellen van probleemoplossing.
- **Wat:** Bij een storing zoekt de AI automatisch in de historie naar vergelijkbare incidenten, parameters en eerdere oplossingen.
- **Techniek:** Vector Search op historische storingslogs en kwaliteitsmeldingen.

### 7. Voorspellende Kwaliteit (Predictive QC)
Kwaliteitscontrole verplaatsen naar de start van het proces.
- **Wat:** Waarschuwing vóór productie: "Deze batch heeft 74% kans op afkeur o.b.v. huidige temperatuur en luchtvochtigheid."
- **Techniek:** Correlatie-analyse tussen procesparameters (hars, temperatuur) en uiteindelijke inspectieresultaten.

### 8. Volledige Traceability
1-klik transparantie voor audits en kwaliteit.
- **Wat:** Eén overzicht met order, operator, machine, recept, grondstoffen (leverancier/batch), foto's, inspecties en storingen.
- **Techniek:** Robuuste relationele data-modellering in NoSQL (of graph-koppelingen in Firestore).

### 9. KPI Command Center
Overkoepelend inzicht voor de productieleiding.
- **Wat:** Live dashboarding van OEE, kwaliteit, storingen, energie, CO₂, veiligheid en personeel.
- **Techniek:** Aggregatie-dashboards (zoals het huidige Lighthouse concept, maar dan fabriek-breed).

### 10. AI Dashboard Generator & Smart Notifications
Self-service analytics en gerichte actie.
- **Wat:** Typ "Laat de afkeur per product zien", en de AI genereert direct de grafiek. Notificaties sturen geen generieke fouten, maar actiegerichte oplossingen naar de dichtstbijzijnde juiste persoon.
- **Techniek:** Text-to-SQL/NoSQL vertalingen en context-aware push notificaties.

---
*Deze visie plaatst het systeem niet langer als slechts een tool, maar als een intelligente partner in het productieproces. Het is de stip op de horizon waar alle huidige architectonische beslissingen (clean code, modulaire hubs, strakke beveiliging) naartoe werken.*

## De Roadmap naar AI-Readiness
Om deze AI-First visie te realiseren, doorloopt het platform eerst een technische voorbereidingsfase. AI heeft feilloos gestructureerde data en historie nodig. De 5 kernstappen zijn:

1. **Van `any` naar Strikte Data Modellen (Zod / TypeScript):** Volledig uitsluiten van flexibele datatypes zodat de structuur voorspelbaar is voor AI.
2. **Event Sourcing & Tijdreeksen:** Het opslaan van historische wijzigingen (append-only) in plaats van overschrijven, noodzakelijk voor voorspellend onderhoud (Predictive Maintenance).
3. **Beveiligde Backend Endpoints:** Het verplaatsen van zware berekeningen en LLM-connecties naar veilige Cloud Functions.
4. **Vector Zoeken:** Het inrichten van embeddings voor eerdere storingen en PDF-handleidingen (Root Cause AI).
5. **Machine-API's (IoT):** Directe sensor-data feeds (bijv. via Infor ION of MQTT) om de Digital Twin en OEE real-time te voeden zonder menselijke tussenkomst.
