# 🤖 AI Assistent Handleiding

## Overzicht
De FPi Future Factory AI Assistent gebruikt **Google Gemini** en is volledig geïntegreerd in het systeem.

## ✅ Huidige Configuratie

### Google Gemini (ACTIEF)
```env
VITE_GOOGLE_AI_KEY=xxxxxx (zet deze key alleen in je lokale .env bestand)
```
De API key is al geconfigureerd en zou direct moeten werken!

### 🚀 Enhanced AI Capaciteit (Nieuw!)
- **Max Output Tokens**: 8000 (was 2000) - Veel uitgebreidere antwoorden mogelijk
- **Document Analyse Limiet**: 50.000 tekens (was 12.000) - Tot 4x grotere documenten
- **Context Opslag**: Volledige document tekst wordt nu opgeslagen voor betere referentie
- **Uitgebreide Analyse**: Documenten worden nu veel gedetailleerder geanalyseerd met:
  - Minimaal 500 karakters samenvatting
  - Volledig gestructureerde context (tot 10.000 karakters)
  - Alle belangrijke feiten, specificaties en details
  - Volledige document tekst beschikbaar voor queries

## 🎯 Functionaliteit

### 1. Chat Modus
De AI kan je helpen met:
- ✅ Vragen over producten (EST, CST, GRE specificaties)
- ✅ Uitleg over hoe het systeem werkt
- ✅ Hulp bij planning en productie
- ✅ Antwoorden op technische vragen
- ✅ Handleiding en gebruiksinstructies

**Voorbeeld vragen:**
- "Wat is het verschil tussen EST en CST?"
- "Hoe wijs ik personeel toe aan een machine?"
- "Waar vind ik product specificaties?"
- "Hoe gebruik ik de planning module?"
- "Wat betekenen de kleuren bij personeel?"

### 2. Training Modus
Genereer educatieve flashcards:
- Kies een onderwerp (bijv. "GRE specificaties")
- AI genereert vraag/antwoord paren
- Interactief leren
- Test je kennis

**Voorbeeld onderwerpen:**
- "GRE specificaties"
- "Veiligheid op de werkvloer"
- "Productcodes Wavistrong"
- "Ploegendiensten"

### 3. Header Zoekbalk Integratie 🆕
Je kunt de AI ook aanspreken via de zoekbalk:

**Methode 1: Bot Knop**
1. Klik op het 🤖 bot icoontje rechts in de zoekbalk
2. Zoekbalk wordt paars
3. Typ je vraag
4. Druk Enter

**Methode 2: ? Prefix**
1. Typ "?" in de zoekbalk
2. Gevolgd door je vraag
3. Druk Enter
4. Je wordt naar de AI assistent geleid met je vraag

**Voorbeelden:**
- "? Hoe werkt de planning module"
- "? Wat is een Wavistrong"
- "? Uitleg over shift kleuren"

## 📚 AI Kennis

De AI heeft uitgebreide kennis over:

### Productie
- GRE, EST, CST specificaties
- Product codes en categorieën
- Afdelingen: Spuitgieten, Verpakking, Lossen
- Shift tijden en kleuren

### Document Analyse
- **Upload Capacity**: Tot 50.000 tekens per document (PDF, TXT, MD, CSV, JSON)
- **PDF Processing**: Automatische tekst extractie uit PDF documenten
- **Intelligent Fallback**: Zelfs als JSON parsing mislukt, wordt document opgeslagen en doorzoekbaar
- **Structured Analysis**: 
  - Titel en uitgebreide samenvatting (min. 500 karakters)
  - Key facts en belangrijke details
  - Processen, partnummers, toleranties
  - Workstations en datums
  - Waarschuwingen en tags
  - Volledige context (tot 10.000 karakters)
- **Context Retention**: Volledige document tekst wordt opgeslagen voor betere AI queries

### Systeem Modules
- **Portaal:** Dashboard en overzicht
- **Planning:** WorkstationHub, Lossen, DigitalPlanning
- **Catalogus:** Product zoeken en filteren
- **Gereedschap:** Voorraad beheer
- **Calculator:** Berekeningstools
- **Berichten:** Notificaties en communicatie
- **Profiel:** Persoonlijke instellingen
- **Admin:** Beheer paneel (alleen admins)

### Features
- Personeel toewijzing
- Shift kleuren (Ochtend=amber, Avond=indigo, Nacht=paars, Dag=blauw)
- Real-time updates via Firebase
- Mobiele functionaliteit
- Notificatie systeem

## 🚀 Gebruik

### Via Sidebar
1. Klik op "AI Assistent" in de sidebar
2. Kies Chat of Training tab
3. Stel je vraag of voer onderwerp in

### Via Header Zoekbalk
1. Klik op 🤖 bot icon (of typ "?")
2. Typ je vraag
3. Druk Enter
4. AI opent met je vraag

## ⚠️ Troubleshooting

### "Geen Google AI API key gevonden"
✅ Check `.env` file - de key zou er al moeten staan
❌ Herstart de dev server: Stop terminal en run `npm run dev`

### "AI geeft geen antwoord"
- Check console voor errors (F12)
- Controleer internet verbinding
- Verify API key is correct
- Test key in Google AI Studio: https://aistudio.google.com/

### "AI vindt mijn documenten niet"

**Debug in Browser Console (F12):**
```javascript
// Lijst alle documenten in de database
await window.aiDebug.listDocuments()

// Test zoekfunctie
await window.aiDebug.searchDocuments("a2e5")

// Test context generatie
await window.aiDebug.testContext("wat weet je over a2e5?")
```

**Checklist:**
- ✅ Is document succesvol geüpload? (Bekijk in AI Documenten sectie)
- ✅ Heeft document een `fullText` veld? (Check in debug output)
- ✅ Is `characterCount` > 0?
- ✅ Zie je "📚 Document search resultaten" in console bij AI vraag?
- ✅ Zie je "✅ Context toegevoegd aan prompt"?

**Als documenten niet worden gevonden:**
1. Open browser console (F12)
2. Upload document opnieuw
3. Check of je "✅ JSON parsing succesvol" ziet
4. Test: `await window.aiDebug.listDocuments()`
5. Test: `await window.aiDebug.searchDocuments("jouw zoekterm")`

### "Rate limit exceeded"
- Google Gemini free tier: 60 requests/minuut
- Wacht een minuut en probeer opnieuw
- Upgrade naar betaalde tier voor hogere limiet

### "Failed to parse flashcard JSON"
- AI probeert JSON te genereren maar format klopt niet
- Probeer opnieuw met een ander onderwerp
- Check console voor details

## 💰 Kosten

### Google Gemini
- ✅ Genereus free tier
- Pro model: gratis tot 60 req/min
- Betaald: ~$0.001 per 1000 tokens

**Schatting voor FPi:**
- Gemiddeld chat bericht: ~500 tokens
- 60 vragen/uur = gratis
- 1000 vragen/dag ≈ $5/maand

## 🏗️ Technische Details

### Architecture
```
src/
├── services/
│   └── aiService.js          # Google Gemini wrapper
├── components/
│   ├── AiAssistantView.jsx   # Main UI (chat + training)
│   ├── Header.jsx            # Zoekbalk met AI integratie
│   └── ai/
│       └── FlashcardViewer.jsx
└── data/
    └── aiPrompts.js          # System prompts & mock data
```

### Key Features
- **Google Gemini Only**: Geoptimaliseerd voor Firebase ecosystem
- **Handleiding Context**: Volledige systeem documentatie in AI
- **Header Integratie**: Direct toegang via zoekbalk
- **Error Handling**: Graceful degradation naar demo mode
- **Toast Notifications**: Gebruikersfeedback
- **Dutch Language**: Alle interacties in Nederlands

### API Calls
```javascript
// Chat
const response = await aiService.chat([
  { role: 'user', content: 'Vraag' }
], MES_CONTEXT);

// Flashcards
const flashcards = await aiService.generateFlashcards(
  'onderwerp',
  FLASHCARD_SYSTEM_PROMPT
);
```

## 🎓 AI Training Tips

De AI is getraind op:
- ✅ Alle systeem modules en hun gebruik
- ✅ Product specificaties (GRE, EST, CST)
- ✅ Ploegendienst informatie
- ✅ Navigatie en workflows
- ✅ Veelgestelde vragen

**Beste practices:**
- Stel specifieke vragen
- Vraag om voorbeelden
- Gebruik context ("In de planning module...")
- Vraag om stap-voor-stap instructies

## 📱 Mobiel Gebruik

De AI werkt volledig op mobiel:
- Responsive design
- Touch-friendly interface
- Header zoekbalk beschikbaar
- PWA ondersteuning

## 🔮 Toekomstige Features

Mogelijke uitbreidingen:
- Voice input (spraak naar tekst)
- Image analysis (foto's van producten)
- Automatische suggesties
- Persoonlijke AI assistent per gebruiker
- Multi-taal support uitbreiding

## 📞 Support

**Problemen of vragen?**
- Check console logs (F12)
- Bekijk deze handleiding
- Vraag het aan de AI zelf: "Hoe gebruik ik de AI assistent?"

**API Key issues?**
- Verifieer in `.env`: `VITE_GOOGLE_AI_KEY` (deze mag nooit in de repo staan)
- Test in Google AI Studio
- Regenereer key indien nodig

---

✅ **Klaar voor gebruik!** De AI is volledig operationeel met Google Gemini.


## Troubleshooting

### "No API key configured"
✅ Check `.env` file - de Google key zou er al moeten staan
❌ Als het nog steeds niet werkt, herstart de dev server: `npm run dev`

### "Invalid API key"
- Controleer of de key correct is gekopieerd (geen extra spaties)
- Voor Google: Zorg dat Gemini API enabled is in Google Cloud Console
- Test de key in de Google AI Studio: https://aistudio.google.com/

### "Rate limit exceeded"
- Google Gemini free tier: 60 requests/minuut
- Wacht een minuut of upgrade naar betaalde tier
- Overweeg een andere provider als backup

### "Failed to parse flashcard JSON"
- AI probeert JSON te genereren maar format is incorrect
- Meestal lost dit zichzelf op bij een nieuwe poging
- Check console voor details

## Kosten Indicatie

### Google Gemini
- ✅ Genereus free tier
- Pro model: gratis tot 60 req/min
- Betaald: ~$0.001 per 1000 tokens

### OpenAI GPT-4
- Geen free tier
- GPT-4: ~$0.03 per 1000 tokens (input)
- GPT-4: ~$0.06 per 1000 tokens (output)

### Anthropic Claude
- Zeer beperkte free tier
- Claude 3.5 Sonnet: ~$0.003 per 1000 tokens (input)
- Claude 3.5 Sonnet: ~$0.015 per 1000 tokens (output)

## Architecture

```
src/
├── services/
│   └── aiService.js          # Universal AI provider wrapper
├── components/
│   ├── AiAssistantView.jsx   # Main UI component
│   └── ai/
│       └── FlashcardViewer.jsx
└── data/
    └── aiPrompts.js          # System prompts & mock data
```

### Key Features
- **Provider Agnostic**: Easy to switch between AI providers
- **Error Handling**: Graceful degradation to demo mode
- **Toast Notifications**: User feedback for errors/success
- **Context Aware**: Includes MES domain knowledge in prompts
- **Dutch Language**: All interactions in Nederlands

## Development

### Test AI Connection
```javascript
// In browser console:
import { aiService } from './services/aiService';

// Test chat
const response = await aiService.chat([
  { role: 'user', content: 'Hallo, test bericht' }
]);
console.log(response);

// Check available providers
console.log(aiService.getAvailableProviders());
```

### Add Custom Context
Edit `MES_CONTEXT` in [AiAssistantView.jsx](src/components/AiAssistantView.jsx):
```javascript
const MES_CONTEXT = `
Je bent een AI assistent voor FPi Future Factory...
[Add your domain-specific information here]
`;
```

## Volgende Stappen

1. ✅ Test de AI assistant in de app (navigeer naar AI tab)
2. Probeer een vraag te stellen in chat mode
3. Probeer training mode met een onderwerp zoals "GRE"
4. Check console voor eventuele errors
5. Bij problemen: herstart dev server en check API key

**Need help?** Check de console logs of contacteer de developer.
