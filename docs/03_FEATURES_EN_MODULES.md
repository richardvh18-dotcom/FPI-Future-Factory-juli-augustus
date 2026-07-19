# 3. Features & Modules

Dit document beschrijft de werking van enkele core features in het Future Factory platform.

---

## 1. Gecentraliseerd Printen (Cloud Queue)

**Doel:** Betrouwbaar printen van ZPL-labels naar een USB-printer vanaf elke tablet/werkstation in de fabriek, zonder afhankelijk te zijn van kwetsbare lokale netwerkprinters of IP-configuraties.

### Architectuur (Store and Forward)
We gebruiken Firestore als een asynchrone wachtrij (`print_queue` collectie).

1. **Aanvraag (Web App):** Een operator op een tablet klikt op "Print". De app genereert de benodigde ZPL-code en schrijft een document in de `print_queue` met de status `pending`.
2. **Lokale Listener (PC):** Een fysieke PC die direct (via USB) aan de printer is gekoppeld, draait een Node.js achtergrondscript. Dit script luistert naar nieuwe `pending` documenten.
3. **Uitvoering (WebUSB):** Zodra het script een document oppakt, zet het de status op `printing`. Vervolgens stuurt het via `node-usb` de ruwe ZPL-data direct naar de Zebra printer.
4. **Afronding:** Na succes is de status `completed`. Bij falen `error`.

### Voordelen
- Printopdrachten gaan nooit verloren als de printer even uit staat (ze blijven `pending`).
- Geen IP-afhankelijkheid, pure Cloud ↔ Local USB koppeling.

---

## 2. AI Assistent (Google Gemini)

De applicatie bevat een ingebouwde AI-assistent aangedreven door Google Gemini.

### Capaciteiten
- Beantwoorden van vragen over specifieke producten (EST, CST, GRE).
- Het genereren van trainingsmateriaal (flashcards) voor operators.
- Doorzoeken van geüploade (PDF) documenten (RAG - Retrieval-Augmented Generation).

### Integratie & Privacy
- **Zoekbalk:** De AI is te benaderen via het 🤖 icoon of door de query te starten met een `?`.
- **Privacy:** De AI heeft hardcoded **geen** toegang tot gebruikerslijsten, wachtwoorden, of persoonsgegevens. De document context-limiet bedraagt 50.000 tekens.
- **Configuratie:** De API key wordt beheerd in de lokale `.env` (`VITE_GOOGLE_AI_KEY`).

### Troubleshooting
Als de AI niet reageert, check de console (`F12`). Voor uitgebreide debug:
```javascript
// Test de document vector-store
await window.aiDebug.listDocuments()
await window.aiDebug.searchDocuments("zoekterm")
```

---

## 3. Digital Planning Modules (Lossen, BM01, Terminal)

Elke afdeling heeft zijn eigen module (Hub) met bijbehorende logica:
- **Lossen:** Het proces waarbij producten na het uitharden (100°C) van een mal worden gehaald.
- **Terminal:** Wikkelstations waar het initiële product gemaakt wordt.
- **BM01:** Eindinspectie en kwaliteitscontrole.

Deze modules maken gebruik van gedeelde Firestore hooks (`useTerminalData`, `useBM01Data`) om real-time de actuele productieplanning over alle tablets te synchroniseren.
