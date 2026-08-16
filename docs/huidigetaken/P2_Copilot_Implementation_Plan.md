# Implementatieplan: AI Production Copilot (P2)

Dit plan beschrijft de technische uitwerking voor de "AI-Native Decision Support MES" Copilot, zoals gedefinieerd in het P2 visiedocument.

## User Review Required

> [!IMPORTANT]
> Dit plan introduceert "Agentic Function Calling" op de backend. Dit is wezenlijk anders dan de huidige statische RAG-chatbot (`aiProxyGenerate`). De LLM (Gemini 2.5 Pro) krijgt de autonomie om zélf interne database-queries te draaien via specifieke cloud functions. Graag goedkeuring voor deze architecturale stap.

## Open Questions

> [!WARNING]
> - **Model Keuze:** Willen we `gemini-2.5-flash` of `gemini-2.5-pro` gebruiken voor de Copilot? Voor complexe function-calling en redenering (zoals "waarom lopen we 14% achter?") is de `pro` variant doorgaans veel krachtiger, hoewel iets langzamer en duurder.
> - **UI Plaatsing:** Waar in de applicatie wil je deze Copilot plaatsen? Als een globale uitschuifbare lade (drawer) over de hele applicatie, of specifiek in het `digitalplanning` dashboard?

## Proposed Changes

We gaan een nieuwe Cloud Function bouwen in de TypeScript map (`functions/src/`) die de Vertex AI Node.js SDK gebruikt om de Agent Loop af te handelen.

---

### Cloud Functions Backend

#### [NEW] `functions/src/services/ai/aiCopilotTools.ts`
Hierin definiëren we de TypeScript functies (gereedschappen) die de AI kan aanroepen. Deze functies draaien server-side en praten met Firestore:
- `getProductionMetrics(date)`: Haalt orders, output en cyclus-tijden op voor een gegeven dag.
- `getDowntimeEvents(date)`: Zoekt naar machinestilstanden, log-events en foutcodes in het systeem.
- `getQualityRejects(date)`: Haalt de QC-rejects/rework data op (waaronder redenen zoals 'Lekkage').
- `getPersonnelLog(date)`: Vraagt de bezetting (Occupancy) op om te zien wie aan welke machine stond.

#### [NEW] `functions/src/services/ai/aiCopilotService.ts`
Bevat de core "Agent Loop":
1. Initialiseert Vertex AI met de tools.
2. Stuurt de gebruikersvraag naar Gemini.
3. Vangt eventuele `functionCall` verzoeken af.
4. Voert de tools uit (`aiCopilotTools.ts`).
5. Geeft de `functionResponse` terug aan Gemini.
6. Retourneert de uiteindelijke synthese aan de client.

#### [MODIFY] `functions/src/callables/aiCallables.ts`
Exposeert de service via een HTTPS Callable `askCopilot`.

---

### Frontend Integratie

#### [MODIFY] `src/services/aiService.ts`
Voegt een methode toe `askCopilot(query: string)` die praat met de nieuwe `askCopilot` cloud function in plaats van de oude `aiProxyGenerate`.

#### [NEW] `src/components/copilot/CopilotInterface.tsx`
Een chat-interface die (in tegenstelling tot de huidige chat) live kan weergeven welke *tools* de AI op de achtergrond aanroept (bijv. "🔍 Zoeken naar machinestilstanden...").

## Advies: AI Copilot Implementatie (Fase P2)

Dit document beantwoordt de openstaande vragen over de integratie van de Agentic AI Copilot in de Future Factory backend.

### 1. Hoe leer ik de AI de "Regels van de Fabriek"?
Je hoeft een modern AI-model (zoals Gemini) niet te trainen met duizenden voorbeelden. Je geeft hem de regels mee via twee kanalen: de System Instructions (Systeem prompt) en de Tools.

**A. Statische Regels (Machine-eigenschappen) -> Via de System Instruction**
Regels die niet vaak veranderen (zoals welke machine wat kan), geef je mee als de "persoonlijkheid" of instructie wanneer je de AI opstart in je code.
Voorbeeld in `aiCopilotService.ts`:
```typescript
const systemInstruction = `
Je bent de Future Factory Plant Manager Copilot. 
Houd je aan de volgende bedrijfsregels:
1. Machine BH18 kan uitsluitend flenzen maken. Dit product is NIET overdraagbaar naar andere machines.
2. Als een machine (zoals de BH18) ruim voorloopt op de planning, adviseer dan ALTIJD om de machine stil te zetten en het personeel over te plaatsen naar een machine die achterloopt. Adviseer NOOIT om andere producten op de BH18 te gaan maken.
`;
```
**Resultaat:** Als jij vraagt: "De BH18 is al klaar, wat nu?", weet de AI door deze instructie dat hij moet adviseren het personeel te verplaatsen, en zal hij niet de fout maken om te zeggen: "Laat ze order X maar gaan wikkelen op de BH18".

**B. Dynamische Data (Personeel/Uitzendkrachten) -> Via de Tools**
De AI moet niet uit zijn hoofd leren wie een uitzendkracht is; dit verandert te vaak. Je past de tool `getPersonnelLog()` aan zodat deze de juiste metadata uit de database (of ATPS) teruggeeft.
Wat de tool teruggeeft aan de AI:
```json
[
  { "naam": "Jan", "id": "1001", "type": "Vast_Personeel", "machine": "BH18" },
  { "naam": "Piet", "id": "9005", "type": "Uitzendkracht", "machine": "BH18" }
]
```
**Resultaat:** Als jij vraagt: "Wie stond er gisteren aan de BH18?", ziet de AI in de data direct wie de vaste medewerker is en wie de uitzendkracht is, en zal dit correct benoemen.

### 2. Flash vs. Pro en Kosten
**Kan ik beginnen met Flash en later overgaan naar Pro?**
Ja, absoluut. Dit is letterlijk het aanpassen van één regel code (`model: 'gemini-2.5-flash'` naar `model: 'gemini-2.5-pro'`). De code voor de tools blijft exact hetzelfde.

**Wat is het verschil (ook in kosten)?**
- **Gemini 2.5 Flash:** Is razendsnel en extreem goedkoop. Het is ontworpen om snel grote hoeveelheden tekst en data (zoals logbestanden) door te spitten.
  - *Kostenindicatie:* Vaak slechts een paar cent per 1 miljoen tokens.
- **Gemini 2.5 Pro:** Is langzamer en duurder, maar heeft een veel hoger IQ. Het is veel beter in complexe, meervoudige redeneringen.
  - *Kostenindicatie:* Gemiddeld 5x tot 10x duurder dan Flash.

**Advies:** Bouw en test de Copilot met Flash. Als je merkt dat de AI de tools niet goed aanroept of de logica van de fabriek niet goed snapt, schakel je over op Pro.

### 3. UI Plaatsing: Eerst Admin, later Globaal?
Dit is de perfecte "Agile" manier van uitrollen.
- **Fase 1 (Nu):** Je bouwt de component `<CopilotInterface />` en plaatst deze uitsluitend als een tabblad of pop-up in je `AdminDashboard.jsx`. Hierdoor kunnen alleen jij en de IT-afdeling ermee testen in productie, zonder dat operators of teamleaders per ongeluk gekke data opvragen.
- **Fase 2 (Later):** Als je de AI 100% vertrouwt, haal je de component uit de Admin-view en zet je hem in je hoofd-`App.tsx` als een uitschuifbare lade (Drawer) die met een zwevende knop op elke pagina kan worden opgeroepen.

### 4. Senior Aanbevelingen voor deze Implementatie
Als je Agentic Function Calling gaat inzetten, raad ik je de volgende drie beveiligings- en optimalisatiestappen aan:
- **Read-Only Tools:** Zorg ervoor dat de functies in `aiCopilotTools.ts` in deze fase alleen data ophalen (GET/READ). Bouw nog geen functies zoals `updateOrderStatus` of `deleteOrder`. De AI mag in deze fase alleen adviseren, niet de database wijzigen.
- **Beperk de Data-grootte (Token limieten):** Als de AI `getProductionMetrics` aanroept, stuur dan geen 10.000 rauwe Infor LN regels terug. Laat je TypeScript functie de data eerst aggregeren (bijv. "Totaal geproduceerd: 450, Totaal afkeur: 12") voordat het aan de AI wordt teruggegeven. Dit houdt de antwoorden snel en de kosten laag.
- **Traceerbaarheid:** Log in je Firebase Backend exact welke vragen aan de AI worden gesteld en welke tools hij besluit te gebruiken. Zo kun je precies zien waarom de AI een bepaald advies heeft gegeven als het niet klopt.

## Architectuur: Dynamisch AI Regels Beheer (Admin Interface)

Dit document beschrijft hoe we de "Fabrieksregels" voor de AI Copilot dynamisch en beheerbaar maken vanuit het Admin Dashboard, in plaats van ze hardcoded in de backend te zetten.

### 1. Het Concept (Hoe het werkt)
- **Invoer (Admin):** Jij typt in het Admin-paneel een regel in natuurlijke taal: *"Vanaf vandaag maakt de BH18 uitsluitend Elbows. Uitzondering: als Gerjan het goedkeurt mogen er ook T-stukken op."*
- **Opslag (Firestore):** Deze regel wordt opgeslagen in een speciale collectie in Firebase.
- **Uitvoering (Copilot):** Zodra een teamleader de AI Copilot een vraag stelt (bijv. "Wat gaan we op de BH18 doen?"), doet de backend eerst een milliseconde-check in de database. Hij haalt al jouw actuele regels op, plakt ze onzichtbaar achter elkaar, en geeft ze aan Gemini mee als de "Grondwet" voordat Gemini antwoord geeft.

### 2. Database Structuur (Firestore)
We maken een nieuw pad aan in `dbPaths.ts` voor de instellingen: `future-factory/settings/ai_factory_rules`
Elk document in deze collectie ziet er zo uit:
```json
{
  "id": "rule_bh18_elbows",
  "category": "Machine_Capaciteit",
  "rule_text": "Machine BH18 mag uitsluitend Elbows produceren. Uitzondering: T-stukken alleen na goedkeuring van Gerjan.",
  "active": true,
  "createdBy": "Richard",
  "lastUpdated": "2026-08-16T10:00:00Z"
}
```

### 3. De Admin Interface: "AI Rule Builder"
We bouwen een nieuwe React-component voor je Admin Dashboard: `<AdminAiRules.tsx>`.

**Hoe de "Chat" functie werkt in de Admin:**
Je kunt hier inderdaad een AI-agent van maken! In plaats van een saai formulier, typt de Admin in een chatvenster:
- **Admin:** *"Zet er een regel in dat uitzendkrachten nooit de BM01 oven mogen bedienen."*

We sturen dit naar een speciale "Rule Builder" functie. De AI analyseert jouw zin en zegt:
- **AI:** *"Oké Richard, ik heb de volgende fabrieksregel geformuleerd: 'Personeel met het type Uitzendkracht mag niet worden toegewezen aan station BM01'. Zal ik deze activeren in de database?"*

Zodra je op "Ja" klikt, slaat hij het op in Firestore.

### 4. Aanpassing in de Backend (`aiCopilotService.ts`)
Om dit te laten werken, passen we de eerder voorgestelde backend service iets aan. Hij moet nu eerst de database lezen.
Concept code voor in je Cloud Function:
```typescript
import * as admin from 'firebase-admin';

async function buildDynamicSystemInstruction() {
  // 1. Haal alle actieve regels op uit Firestore
  const rulesSnap = await admin.firestore()
    .collection('future-factory/settings/ai_factory_rules')
    .where('active', '==', true)
    .get();

  let dynamicRules = "";
  rulesSnap.forEach(doc => {
    dynamicRules += `- ${doc.data().rule_text}\n`;
  });

  // 2. Bouw de uiteindelijke System Prompt
  const baseInstruction = \`Je bent de FPi Plant Manager Copilot. Houd je strikt aan deze actuele fabrieksregels:\\n\`;
  
  return baseInstruction + dynamicRules;
}

// In de Agent Loop:
const systemInstruction = await buildDynamicSystemInstruction();
// Geef 'systemInstruction' mee aan Gemini.
```

### 5. De Grote Voordelen van deze Aanpak
- **Zero-Code Updates:** Als een machine morgen kapot is, kun je in de Admin typen: *"Regel: BH15 is buiten gebruik tot vrijdag. Adviseer routing via BH18."* De hele fabriek (en de AI) weet dit direct, zonder dat je de app opnieuw hoeft te deployen (Vercel/Firebase).
- **Audit & Historie:** Je kunt regels aan- en uitzetten. Je bouwt een bibliotheek op van fabriekslogica ("Knowledge Graph") die altijd bewaard blijft, zelfs als ervaren collega's met pensioen gaan.
- **Schaalbaarheid:** Je kunt de regels later indelen op afdeling (Fittings, Spoolbouw). Als iemand van Spoolbouw een vraag stelt, haalt de AI alleen de Spoolbouw-regels op.

## Architectuur: AI Documenten & Kennisbank (RAG)

**Het Huidige Probleem:**
Je kunt nu al documenten uploaden naar Firebase, maar de AI haalt er niet altijd goed de antwoorden uit. Dit komt doordat we in de oude opzet de tekst simpelweg afkappen op 5.000 karakters en met simpele trefwoorden zoeken. Grote handleidingen of specifieke procedures worden daardoor vaak gemist.

**De Oplossing in de nieuwe Copilot (Fase P2):**
In plaats van de hele tekst "blind" mee te sturen, geven we de AI een gericht zoek-gereedschap en maken we de documenten veel slimmer doorzoekbaar via AI Embeddings.

### 1. Vector Zoeken (Embeddings)
Wanneer je een document uploadt in de `<AiDocumentUploadView />`, hakken we de tekst in de achtergrond in kleine stukjes (chunks). Elk stukje sturen we naar een "Embedding Model" (zoals Google's `text-embedding-004`). Dit model zet de *betekenis* van de tekst om in data (een vector). 
We slaan deze vectoren op in Firestore, dat tegenwoordig native **Vector Search** ondersteunt.

### 2. De `searchKnowledgeBase` Tool
We voegen een nieuwe tool toe aan `aiCopilotTools.ts`:
```typescript
- searchKnowledgeBase(zoekVraag: string): Zoekt in de geüploade fabrieksdocumenten naar procedures, handleidingen en instructies.
```
**Hoe het werkt in de praktijk:**
1. **Teamleader vraagt:** *"Wat betekent foutcode E-404 op de BM01 oven en hoe los ik het op?"*
2. **AI Copilot:** Denkt na en realiseert zich: *"Dit is een specifieke technische vraag, ik moet in de documentatie kijken."*
3. **Tool Aanroep:** De AI roept autonoom de tool `searchKnowledgeBase("foutcode E-404 BM01 oven oplossen")` aan.
4. **Vector Database:** Firestore zoekt razendsnel naar de alinea in jouw geüploade PDF's die het meest overeenkomt met de *betekenis* van de vraag, zelfs als de exacte bewoording in het document iets anders is.
5. **Antwoord:** De tool geeft puur en alleen de meest relevante alinea's (inclusief bronvermelding) terug aan de AI, waarna de AI een strak en feitelijk kloppend antwoord kan genereren, in plaats van te hallucineren.

### 3. Actiepunten voor de Backend
- Firebase Vector Search activeren (of de Gemini Document API inzetten) voor de collectie waar de documenten leven.
- Een Cloud Function schrijven (`generateEmbeddings`) die afvuurt zodra een nieuw document is geüpload om de tekst te 'chunk-en' en embedden.
- De nieuwe tool `searchKnowledgeBase` bouwen en inpluggen in de nieuwe Copilot Agent Loop.

## Verification Plan

### Automated Tests
- Mocks schrijven voor de tools in `aiCopilotTools.ts` om te verifiëren of ze correct converteren naar Gemini Function Declarations.

### Manual Verification
- We sturen een test-query: *"Waarom liep BM01 gisteren vast en wie bediende de machine?"*
- We verifiëren in de Cloud Functions logs (en de frontend UI) dat de AI daadwerkelijk de `getDowntimeEvents` en `getPersonnelLog` tools autonoom aanroept en een kloppende synthese teruggeeft.

 
 # #   F a s e   5   V o l t o o i d   ( R o l - g e b a s e e r d e   U n i f i c a t i e ) 
 -   W e   h e b b e n   d e   o u d e   s t a t i s c h e   A I   A s s i s t e n t   v e r w i j d e r d   e n   a l l e   v e r k e e r   o m g e l e i d   n a a r   d e   s l i m m e   C o p i l o t . 
 -   R o l - g e b a s e e r d e   t o e g a n g   ( R B A C )   i s   n u   g e � m p l e m e n t e e r d   i n   d e   C o p i l o t   S e r v i c e .   O p e r a t o r s   k r i j g e n   a l l e e n   d e   k e n n i s b a n k   ( v i a   E m b e d d i n g s ) ,   M a n a g e r s / A d m i n s   k r i j g e n   o o k   i n z i c h t   i n   l i v e   p r o d u c t i e c i j f e r s . 
 -   E r   i s   e e n   V e r t e x   A I   E m b e d d i n g s   S e r v i c e   t o e g e v o e g d   d i e   g e � p l o a d e   d o c u m e n t e n   v e r k n i p t   e n   w i s k u n d i g e   v e c t o r e n   o p s l a a t   i n   F i r e s t o r e   v o o r   s u p e r s n e l l e   R A G   ( R e t r i e v a l - A u g m e n t e d   G e n e r a t i o n ) . 
  
 
 
 # #   F a s e   6   V o l t o o i d   ( C o s t   C o n t r o l   &   S c h a a l b a a r h e i d ) 
 -   * * S e m a n t i c   C a c h i n g : * *   V o o r d a t   G e m i n i   w o r d t   a a n g e r o e p e n ,   z o e k e n   w e   o f   d e   v r a a g   ( v i a   w i s k u n d i g e   e m b e d d i n g s   > 9 5 %   s i m i l a r i t y )   r e c e n t   a l   i s   g e s t e l d .   Z o   j a ,   d a n   s e r v e r e n   w e   h e t   o p g e s l a g e n   a n t w o o r d   d i r e c t   u i t   F i r e b a s e   \  i _ c a c h e \   t e g e n   � 0 . 0 0   k o s t e n   e n   0   s e c o n d e n   l a a d t i j d . 
 -   * * R a t e   L i m i t i n g : * *   E r   i s   e e n   d y n a m i s c h   q u o t a - s y s t e e m   g e b o u w d   v i a   \  i U s a g e T r a c k e r . t s \ .   O p e r a t o r s   m o g e n   m a x i m a a l   2 5   c o m p l e x e   v r a g e n   p e r   d a g   s t e l l e n ,   T e a m l e a d e r s / P l a n n e r s   1 0 0 .   D i t   v o o r k o m t   w i l d g r o e i   e n   o n v e r w a c h t e   A P I   r e k e n i n g e n . 
  
 