# Printer Routing Setup

## Doel

Gebruik aparte printerrecords voor aparte fysieke printers, ook als het hetzelfde model is. Dit maakt gerichte aansturing per fysiek station mogelijk.

Voorbeeld:
- `ZM400-WIKKELSTATION-1` met routing keys `WIKKELEN, SMALL, STATION:W01`
- `ZM400-EINDINSPECTIE` met routing keys `GENERAL, LARGE, STATION:INSPECTIE`

Zo kan de applicatie labels routeren zonder een globale default printer, maar op basis van het type werkplek of de specifieke bewerking.

## Inrichting per computer

1. Maak in **Printer Beheer** voor elke fysieke printer een apart record aan.
2. Geef per printer duidelijke routing keys op (bijv. `STATION:INSPECTIE`).
3. Open op de betreffende computer (bijv. de tablet bij de eindinspectie) de print listener of print station pagina.
4. Koppel op die computer alleen de lokaal aangesloten USB-printer.
5. Laat computers op andere stations hetzelfde doen voor hun eigen lokaal aangesloten printers.

De interne queue processor pakt vervolgens alleen jobs op voor de printer die op die specifieke computer/browser geautoriseerd en gekoppeld is.

## Aanbevolen routing keys

- `WIKKELEN`: Labels specifiek voor de wikkelstations
- `FLANGE`: Alias voor speciale flenslabels
- `GENERAL`: Algemene labels (bijv. voor pallets of grote kratten)
- `LARGE`: Alias voor grote labels
- `STATION:W01`: Expliciete printer voor Wikkelstation 1
- `STATION:INSPECTIE`: Expliciete printer voor de Eindinspectie (bijv. BM01)

## Zonder beheerdersaccount

Voor WebUSB-printen is normaal geen lokaal Windows-beheerdersaccount nodig zodra:
1. de benodigde printerdriver (bijv. Zebra ZDesigner of Lighthouse TSPL) al aanwezig is op de host, of
2. de browser (Chrome/Edge) de USB-printer eenmalig mag autoriseren voor die gebruiker.

Praktisch advies voor de werkvloer:
- Gebruik een vaste browserlogin per station (bijv. een inlog voor Wikkelstation 1).
- Koppel daar eenmalig alleen de bijbehorende USB printer.
- Geef operators op de vloer geen toegang tot 'Printer Beheer' als dat niet strikt noodzakelijk is.

Als een driver nog helemaal niet op de pc staat, is meestal een eenmalige installatie door IT nodig. Daarna kan de operator dagelijks zonder adminrechten via WebUSB blijven printen.

## Voorbeeldconfiguratie

### Wikkelstation PC
- **Printernaam:** `ZM400 Wikkelen`
- **Routing keys:** `WIKKELEN, SMALL, STATION:W01`
- **Gekoppelde USB-printer:** Alleen de kleine Zebra printer op het wikkelstation.

### Inspectie PC
- **Printernaam:** `ZM400 Inspectie Groot`
- **Routing keys:** `GENERAL, LARGE, STATION:INSPECTIE`
- **Gekoppelde USB-printer:** Alleen de grote Zebra printer op de eindinspectie.

## Resultaat
Door deze inrichting gaan product-specifieke labels automatisch naar de juiste fysieke printer, ongeacht op welk scherm de operator de print-opdracht triggert. Minder kritische flows (zoals algemene status-labels) kunnen dezelfde routing helper gebruiken, zolang ze de correcte `routeKey` meegeven in de datastroom.