# Architectuur Roadmap: Zoeken binnen FPI Future Factory

Dit document beschrijft de gefaseerde aanpak voor het zoeken naar orders, documenten (zoals tekeningen) en producten op de digitale werkvloer naarmate de fabriek opschaalt. Aangezien het ERP-systeem de *Single Source of Truth* blijft, fungeert de Future Factory app als het MES (Manufacturing Execution System) op de vloer.

## Achtergrond
De huidige Firebase Firestore database structuur scheidt de data op via diepe mappen (bijv. per machine, per afdeling). Dit is logisch voor structuur en permissies, maar maakt globaal zoeken ("Waar in de fabriek is order 25628?") potentieel kostbaar qua database reads als er niet op de juiste manier gezocht wordt. Omdat de fabriek zal uitbreiden van 1 naar 11 machines en extra afdelingen (Spoolbouw, QC, Shipping), moet de architectuur in logische fasen meegroeien.

---

## Fase 1: MVP en Directe Client-Side Zoekopdrachten (Huidige Status)
Op dit moment (met de implementatie rondom 1 live machine) wordt de zoekopdracht direct vanaf de iPad/browser via de Firestore SDK uitgevoerd.

* **Architectuur:** De `orderLabelSearch.ts` zoekt sequentiëel door de collecties van de aangesloten machines. Het breekt de zoekopdracht af zodra de order is gevonden (early exit).
* **Waarom:** Dit houdt de architectuur simpel. Geen backend-functies nodig. Omdat er nog veel wijzigingen plaatsvinden in datastructuren tijdens de bouwfase, zorgt dit voor maximale flexibiliteit.
* **Limieten:** Wanneer de overige 10 machines, Spoolbouw en externe componenten live gaan, zal het direct inladen van diepe mappen leiden tot tragere responstijden en hoge read-kosten.

---

## Fase 2: De "Inhoudsopgave" Index via Cloud Functions (Groeifase)
Wanneer meerdere machines live gaan of wanneer de Spoolbouw app (inclusief tekeningen) wordt toegevoegd, stappen we over op een gecentraliseerde zoek-index.

* **Architectuur:**
  1. We creëren een platte, centrale collectie: `global_search_index`.
  2. Een Google Cloud Function (of een webhook vanuit de ERP-integratie) luistert naar wijzigingen in de orders/tekeningen collecties.
  3. Zodra een order binnenkomt of verplaatst wordt, schrijft de functie een kleine, platte samenvatting (Ordernummer, Machinenaam, Type, Status) naar de `global_search_index`.
* **Waarom:** 
  Als een medewerker op de werkvloer een order zoekt, bevraagt de UI uitsluitend nog de `global_search_index`. Dit kost maximaal het aantal getoonde zoekresultaten aan reads (bijv. 5 reads in plaats van potentieel duizenden), ongeacht hoeveel data het ERP systeem naar Firestore pompt.
* **Complexiteit:** Laag. Kan met basis Firestore functionaliteiten en standaard Cloud Functions gerealiseerd worden.

---

## Fase 3: Dedicated Search Engine (Lange Termijn: QC & Shipping)
Als QC, Shipping en externe import aan de app worden toegevoegd, verandert de behoefte van medewerkers. Zij zoeken niet meer puur op exacte ordernummers, maar mogelijk op beschrijvingen ("Costess", "Flenzen", "Klep 3A") of op gedeeltelijke klantnamen. 

* **Architectuur:** We integreren een gespecialiseerde zoekmachine (zoals **Algolia** of **Typesense**) via officiële Firebase Extensions.
* **Waarom:** 
  NoSQL databases (zoals Firestore) hebben geen ingebouwde full-text search. Ze kunnen geen spelfouten negeren of zoeken midden in een string. Algolia of Typesense zijn daar specifiek voor gebouwd.
* **Voordelen:**
  - Onmiddellijke (milliseconden) zoekresultaten over gigantische datasets.
  - "Fuzzy matching" (typfouten worden automatisch gecorrigeerd).
  - Meerdere afdelingen, statussen en documentsoorten (tekeningen vs. fysieke producten) door elkaar heen categoriseren in één zoekbalk.
* **Limieten:** Vereist licentie/implementatie van derde partijen, vandaar dat dit de laatste fase is zodra de workflow vereisten dit onmisbaar maken.

---
*Document aangemaakt op 6 Augustus 2026.*
