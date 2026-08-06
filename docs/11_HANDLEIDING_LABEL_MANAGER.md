# Handleiding: Label Manager & Label Designer

Welkom bij de handleiding voor het **Label Beheer** binnen de Future Factory applicatie. Deze module stelt je in staat om zelf labels te ontwerpen, dynamische regels toe te passen en aan te geven welk label op welke machine geprint moet worden. 

Deze handleiding is geschreven voor procesbeheerders en werkvoorbereiders.

---

## 1. Introductie tot de Module

Onder de tab **Admin > Label & Printbeheer** vind je drie belangrijke onderdelen:

1. **Label Designer (Ontwerper):** Hier "teken" je visueel het etiket. Je plaatst tekst, barcodes, lijnen en logo's.
2. **Label Logica (Variabelen):** Hier definieer je slimme regels. (Bijv: "Als de diameter groter is dan 200, noem de variabele dan X, anders Y").
3. **Print Regels (Koppelingen):** Hier vertel je het systeem *wanneer* een specifiek label geprint moet worden (bijv. "Gebruik label X voor Machine BH11 als het een Flens is").

---

## 2. Label Designer

In de Label Designer ontwerp je de lay-out van je etiket. Wat je op het scherm ziet, is exact hoe het uit de Zebra-printer zal rollen.

### Elementen toevoegen
Bovenin het scherm vind je knoppen om elementen toe te voegen:
- **T (Tekst):** Voor normale leesbare tekst.
- **Barcode:** Voor streepjescodes.
- **QR-Code:** Voor blokjescodes (handig om in 1 scan veel data te lezen).
- **Lijnen / Rechthoeken:** Voor de opmaak.
- **Afbeelding:** Om bijv. het bedrijfslogo of CE-markering toe te voegen.

### Variabelen vs. Vaste Tekst (Static Text)
Als je een Tekst of Barcode selecteert, zie je in de rechterbalk een menu. Je kunt daar kiezen uit twee opties:
1. **Statische tekst (`-- Vaste tekst --`):** Je typt zelf wat er geprint moet worden (bijv. de tekst "Gemaakt door FPI"). Dit is op elk label hetzelfde.
2. **Variabele:** Je selecteert een stukje data uit het ERP. Het systeem vult dit veld automatisch in tijdens het printen, gebaseerd op de actieve order. 

---

## 3. Alle Standaard Variabelen (`AllVariables`) Uitgelegd

Dit is de lijst met ingebouwde variabelen die je direct in de ontwerper kunt selecteren. Deze data wordt rechtstreeks uit de order of het product in het ERP gehaald.

| Variabele in de lijst | Wat betekent dit in de praktijk? | Voorbeeld |
| :--- | :--- | :--- |
| **lotNumber** | Het unieke batch/lotnummer van deze productierun. | `20260806-01` |
| **orderNumber** (`orderId`) | Het order- of projectnummer. | `N20025628` |
| **itemCode** | De artikelcode zoals bekend in het ERP. | `4101234` |
| **productType** | Het type product (bijv. Pipe, Flange, Elbow). | `Flange` |
| **diameterDn** (`diameter`) | De nominale diameter (DN). | `200` |
| **pressurePn** (`pressure`) | De drukklasse (PN). | `16` |
| **innerDiameter** | De inwendige diameter in millimeters (ID). | `219` |
| **nprs** | Nominal Pressure Rating. | `16` |
| **pq** | Qualified Pressure. | `20` |
| **temperatureLimit** (`temperature`) | De maximale temperatuur (vaak in graden Celsius). | `65°C` |
| **productionDate** (`date`) | De datum waarop het label wordt geprint / geproduceerd. | `06-08-2026` |
| **extraCode** | De specifieke product- of verbindingscode (bijv. A2G3 of A1G1). | `A2G3` |
| **jointCode** | Een extra specifieke regel of tekst, speciaal voor een project dat een bepaalde extraCode heeft. | `Joint specs...` |

### Geformatteerde Lijnen (Kant-en-klare zinnen)
Sommige variabelen zijn al voorgeprogrammeerd als hele zinnen, zodat je dat niet zelf in elkaar hoeft te knutselen op het label:

* **idLine:** Print "ID: [inwendige diameter] mm"
* **pressureLine:** Print "PN: [druk] bar"
* **pressureLineEmt:** Specifieke weergave voor EMT druklijnen.
* **connectionLine:** Print het type verbinding (bijv. "Lijmverbinding / Adhesive joint").
* **radiusText:** Toont de radius (handig bij bochten/elbows).
* **flangeIdLine / flangePressureLine / flangeConnectionLine / flangeDrillingLine:** Dit zijn kant-en-klare tekstregels specifiek opgemaakt voor Flenzen, inclusief boorpatronen (Drilling).

---

## 4. Dynamische Variabelen (Label Logica)

Soms is de standaard data uit het ERP niet precies wat je op het label wilt printen. Je wilt bijvoorbeeld dat "PN 16" wordt geprint als "Class 150" als het product naar Amerika gaat. Hiervoor gebruik je **Label Logica**.

### Hoe werkt dit?
1. Ga naar **Label Logica**.
2. Maak een nieuwe regel aan voor een **Productcode** (bijv. `A1S1`).
3. Maak een **Variabele** aan, bedenk een naam (bijv. `mijn_amerikaanse_druk`).
4. Kies een **Triggerveld** (waar kijkt het systeem naar? Bijv. naar `pressurePn`).
5. Voeg een **Conditie (Uitkomst)** toe:
   * *Conditie:* `16`
   * *Uitkomst:* `Class 150`

Als je deze Logica hebt opgeslagen, zul je in de Label Designer ineens de variabele `mijn_amerikaanse_druk` zien verschijnen in het dropdown menu onder het kopje **Dynamische Variabelen**. Als je die op je label plaatst, zal het systeem de regel toepassen tijdens het printen.

---

## 5. Print Regels (Koppelingen)

Je hebt nu een etiket ontworpen (`Mijn_Flens_Label`) en hij zit vol met handige variabelen. Nu moet de machine nog weten dát hij dit label moet gebruiken.

1. Ga naar **Print Regels**.
2. Maak een regel aan: *"Als een order naar machine **BH11** gaat, EN het **Product Type** is **Flens**..."*
3. *"...gebruik dan **Mijn_Flens_Label**"*
4. *"...en print hem **2 keer** per product."*

Vanaf nu zal de app voor de operator bij machine BH11 volautomatisch het juiste labelontwerp selecteren zodra hij op "Print" drukt voor een Flens.

---
*Voor technische vragen of aanpassingen aan dit systeem, neem contact op met de systeembeheerder of raadpleeg de IT documentatie (`01_PROJECTSTRUCTUUR_EN_ARCHITECTUUR.md`).*
