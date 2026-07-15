# Implementatieplan: Rodomach Robot Integratie & Zelflerende Parameters

Dit plan beschrijft de stappen om het huidige Excel-gebaseerde proces (`WM18_Rekenprogramma_versie_12.xlsm`) te vervangen door een directe, slimme integratie in de Future Factory webapplicatie.

## Doel
Het automatiseren van de programma-generatie voor de Rodomach wikkelrobots (zoals BH18). De app zal de benodigde parameters (cycli, hoeken, standen) berekenen op basis van productgegevens (diameter, drukklasse, type), hier een ABB RAPID `.MOD` bestand van maken, en dit via FTP direct naar de robot sturen wanneer de operator de productie start.

> [!WARNING]
> **User Review Required**
> Omdat we met fysieke robots werken, vereist dit plan strikte validatie. Foutieve parameters kunnen de robot laten crashen of producten verkeerd wikkelen. We zullen een testfase inbouwen waarbij we de gegenereerde `.MOD` bestanden uit onze app vergelijken met de `.MOD` bestanden uit de oude Excel, *voordat* we ze daadwerkelijk naar de robot sturen.

## Open Questions

> [!IMPORTANT]
> **Vragen over Netwerk & Architectuur (Graag beantwoorden voordat we starten):**
> 
> 1. **Netwerkverbinding (FTP):** Het IP-adres van de robot (`192.168.125.1`) is een lokaal netwerkadres. Omdat Future Factory in de cloud draait (browser), kunnen we vanuit de webpagina niet direct een FTP-verbinding maken naar een lokaal IP-adres. Hebben jullie lokaal in de fabriek al een 'print server' of 'relay server' (bijv. Node.js of Python) draaien die we hiervoor kunnen gebruiken? Anders moeten we een klein lokaal scriptje schrijven dat op de PC/Tablet naast de robot draait om de bestanden door te sturen.
> 2. **Referentie Bestanden:** Zou je 2 of 3 voorbeeld `.MOD` bestanden (die momenteel door de Excel gegenereerd worden voor verschillende producten) kunnen aanleveren? Hiermee kan ik "Unit Tests" schrijven om te garanderen dat mijn code exact dezelfde output genereert als de Excel.
> 
> *(Vraag 3 beantwoord: Deze integratie wordt exclusief voor BH18 gebouwd, aangezien dit het enige station is met deze robot.)*

## Proposed Changes

### 1. Reverse-Engineering & Datamodellering
*Uitlezen van de Excel-logica en deze vertalen naar TypeScript.*
#### [NEW] `src/utils/rodomach/rodomachCalculator.ts`
- Functies om winding cycli, snelheden en hoeken te berekenen op basis van product-dimensies.
#### [NEW] `src/utils/rodomach/rapidGenerator.ts`
- Functie die de berekende parameters omzet in de exacte syntax van een ABB `.MOD` bestand.

### 2. Robot Configuratie UI (Voor Engineers)
*Een beheerscherm waar Engineers de variabelen per product(groep) kunnen aanpassen.*
#### [NEW] `src/components/admin/RodomachConfigView.tsx`
- Een interface met tabellen/sliders voor het finetunen van de robotparameters (ter vervanging van de verborgen tabbladen in Excel).
#### [MODIFY] `src/components/admin/AdminSettingsView.tsx`
- Toevoegen van een navigatie-tegel voor de nieuwe "Robot Configuratie".

### 3. Productie Integratie (Voor Operators)
*De naadloze start van het programma.*
#### [MODIFY] `src/components/digitalplanning/modals/ProductionStartModal.tsx`
- Inbouwen van een check: "Heeft dit product een gevalideerd robotprogramma?"
- Bij het klikken op "Start": genereren van de `.MOD` data.
#### [NEW] `src/services/robotFtpService.ts`
- De service die de gegenereerde `.MOD` data verstuurt. (Afhankelijk van het antwoord op Open Question #1, stuurt deze service de data naar een lokale relay-server die de daadwerkelijke FTP-verbinding met `192.168.125.1` opzet).

## Verification Plan

### Automated Tests
- `npm run test` voor de `rodomachCalculator` en `rapidGenerator`. We voeren productparameters in (bijv. 100mm, PN16, Elbow 90deg) en valideren via assertions dat de resulterende `.MOD` string exact overeenkomt met de output van de oude Excel.

### Manual Verification
1. Lokaal testen van het Configuratie-scherm (wijzigingen opslaan in Firestore en uitlezen).
2. "Dry-run" op de vloer: De app genereert een bestand voor Slot 1, we openen het `.MOD` bestand lokaal om te controleren of de robotbesturing dit zonder errors accepteert (voordat de robot fysiek gaat bewegen).
