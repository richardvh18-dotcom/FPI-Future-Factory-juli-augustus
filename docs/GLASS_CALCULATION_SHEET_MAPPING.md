# Glass Calculation Fittings - Exacte Mappingtabel Per Sheet

Datum: 2026-07-10
Bronbestand: Tijdelijke Bestanden/Excel/Copy of Glass Calculation Fittings.xlsm
Doel: Werkdocument voor development (eenmalige baseline-import + revisie-imports)

## 1. Importstrategie

1. Alleen deze sheets als data-bron importeren:
- Wavistrong CBCBCB
- Wavistrong TBTBTB
- Fibermar CBCBCB
- Special
- Endcap PL
- Manhole Bottom
- Codification
- Revision
- Design Endcap >1500mm

2. Deze sheets niet als bronrecords importeren (alleen eventueel als print-template referentie):
- Glass_Endcap_DU
- Glass_Endcap_EN
- Glass_Bottom_DU
- Glass_Bottom_EN
- Output
- Input

3. Datastart (1-based) voor tabellen:
- Tee-sheets: rij 3
- Endcap PL: rij 3
- Manhole Bottom: rij 3
- Codification: rij 3 (speciale key-value structuur)
- Revision: rij 7 (revision log)

## 2. Canonieke doelvelden

Gebruik onderstaande canonieke doelvelden in de app-datalaag.

### 2.1 Algemeen
- sourceSheet
- sourceRow
- itemCode
- pressureBar
- innerDiameterMm
- branchDiameterMm
- wallThicknessMm
- productName
- articleNumber
- weightKg

### 2.2 Snijregels
- bigWovenLengthMm
- bigWovenWidthMm
- bigWovenCountPerCycle
- smallWovenLengthMm
- smallWovenWidthMm
- smallWovenCountPerCycle
- smallCGlassLengthMm
- smallCGlassWidthMm
- bigCGlassLengthMm
- bigCGlassWidthMm
- woven360LengthMm
- woven360WidthMm
- cycles
- countBig
- countSmall
- totalBig (afgeleid)
- totalSmall (afgeleid)
- twPerCycle
- oldCycles

### 2.3 Endcap-specifiek
- strengthClassNmm2
- domeWallThicknessMm
- knuckleWallThicknessMm
- laminationLengthMm
- domeRadiusMm
- knuckleRadiusMm
- angleRcRkDeg
- yHeightMm
- builtInLengthMm
- chamferLengthMm
- extraTeKnuckle
- layers
- knuckleLength
- knuckleFactor2_5
- cycleBig
- cycleSmall
- cycleFirstPart

### 2.4 Manhole-specifiek
- tecMm
- tekMm
- socketLengthMm
- moldCircumferenceMm
- heightHbMm
- b2Mm
- outerDiameterMm
- moldNote

## 3. Mapping - Tee sheets

Van toepassing op:
- Wavistrong CBCBCB
- Wavistrong TBTBTB
- Fibermar CBCBCB
- Special

Contextwaarden per sheet:
- productType = tee
- family:
  - Wavistrong CBCBCB -> wavistrong
  - Wavistrong TBTBTB -> wavistrong
  - Fibermar CBCBCB -> fibermar
  - Special -> special
- connectionType:
  - CBCBCB of TBTBTB afgeleid uit sheetnaam

| Kolom idx | Header rij 1 | Header rij 2 | Doelveld |
|---|---|---|---|
| 0 | Item | [-] | itemCode |
| 1 | PN | bar | pressureBar |
| 2 | ID | mm | innerDiameterMm |
| 3 | ID1 | mm | branchDiameterMm |
| 4 | TW | mm | wallThicknessMm |
| 5 | (L) | mm | lengthL |
| 6 | (L1) | mm | lengthL1 |
| 7 | Lo | mm | lengthLo |
| 8 | Lo1 | mm | lengthLo1 |
| 9 | Weight | kg | weightKg |
| 10 | art. no | [-] | articleNumber |
| 11 | Product Name | [-] | productName |
| 12 | Groot Weefsel | Lengte | bigWovenLengthMm |
| 13 | (leeg) | Breedte | bigWovenWidthMm |
| 14 | Aantal | [-] | bigWovenCountPerCycle |
| 15 | Klein Weefsel | Lengte | smallWovenLengthMm |
| 16 | (leeg) | Breedte | smallWovenWidthMm |
| 17 | Aantal | [-] | smallWovenCountPerCycle |
| 18 | klein C-glass | Lengte | smallCGlassLengthMm |
| 19 | (leeg) | Breedte | smallCGlassWidthMm |
| 20 | groot C-glass | Lengte | bigCGlassLengthMm |
| 21 | (leeg) | Breedte | bigCGlassWidthMm |
| 22 | 1 stuk Weefsel 360 | Lengte | woven360LengthMm |
| 23 | (leeg) | Breedte | woven360WidthMm |
| 24 | Cycli | [-] | cycles |
| 25 | Aantal | Groot | countBig |
| 26 | Aantal | Klein | countSmall |
| 28 | Tw/cycle | (var) | twPerCycle |
| 30 | Old Cycli | [-] | oldCycles |
| 32 | (leeg) | Cycle | cycleNoteRaw |

Validatie Tee:
- Verplicht: itemCode, pressureBar, innerDiameterMm, branchDiameterMm, cycles
- Minimaal 1 matgroep met lengte+breedte+aantal aanwezig
- Numeriek > 0 voor relevante maten/aantallen
- totalBig = cycles * countBig
- totalSmall = cycles * countSmall
- Afrondingsregel cycli conform notitie in sheet (fractie < 0.5 omlaag, >= 0.5 omhoog)

## 4. Mapping - Endcap PL

Contextwaarden:
- productType = endcap
- family = endcap
- connectionType = pl

| Kolom idx | Header rij 1 | Header rij 2 | Doelveld |
|---|---|---|---|
| 0 | Item | [-] | itemCode |
| 1 | PN | bar | pressureBar |
| 2 | ID | mm | innerDiameterMm |
| 3 | SH | N/mm2 | strengthClassNmm2 |
| 4 | TWc | mm | domeWallThicknessMm |
| 5 | TWk | mm | knuckleWallThicknessMm |
| 6 | Llam | mm | laminationLengthMm |
| 7 | Rc | mm | domeRadiusMm |
| 8 | Rk | mm | knuckleRadiusMm |
| 9 | Ang. Rc-Rk | degree | angleRcRkDeg |
| 10 | Y | mm | yHeightMm |
| 11 | L | mm | builtInLengthMm |
| 12 | Luit | mm | chamferLengthMm |
| 13 | Weight | kg | weightKg |
| 14 | art. no | [-] | articleNumber |
| 15 | Product Name | [-] | productName |
| 16 | Groot Weefsel | Type | bigWovenType |
| 17 | Groot Weefsel | Lengte | bigWovenLengthMm |
| 18 | (leeg) | Breedte | bigWovenWidthMm |
| 19 | Totaal Aantal | [-] | totalBig |
| 20 | Extra TE | Knuckle | extraTeKnuckle |
| 21 | Lagen | [-] | layers |
| 22 | Lenght | Knuckle | knuckleLength |
| 23 | Knucklex2.5 | [-] | knuckleFactor2_5 |
| 24 | Klein Weefsel | Type | smallWovenType |
| 25 | Klein Weefsel | Lengte | smallWovenLengthMm |
| 26 | (leeg) | Breedte | smallWovenWidthMm |
| 27 | Totaal Aantal | [-] | totalSmall |
| 28 | Groot | Cycli | cycleBig |
| 29 | Klein | Cycli | cycleSmall |
| 30 | 1e deel | Cycli | cycleFirstPart |

Validatie Endcap:
- Verplicht: pressureBar, innerDiameterMm, domeWallThicknessMm, knuckleWallThicknessMm, builtInLengthMm
- Minimaal 1 matgroep met lengte+breedte+totaal
- Controle: cycleBig >= cycleFirstPart als cycleFirstPart gevuld is
- Endcap >1500 regel toepassen (sheet Design Endcap >1500mm)

## 5. Mapping - Manhole Bottom

Contextwaarden:
- productType = manhole_bottom
- family = manhole
- connectionType = sb

| Kolom idx | Header rij 1 | Header rij 2 | Doelveld |
|---|---|---|---|
| 0 | Item | [-] | itemCode |
| 1 | PN | bar | pressureBar |
| 2 | ID | mm | innerDiameterMm |
| 3 | SH | N/mm2 | strengthClassNmm2 |
| 4 | Tec | mm | tecMm |
| 5 | Tek | mm | tekMm |
| 6 | SB | mm | socketLengthMm |
| 7 | Omtrek Mal | mm | moldCircumferenceMm |
| 8 | HB | mm | heightHbMm |
| 9 | Weight | kg | weightKg |
| 10 | B2 | [mm] | b2Mm |
| 11 | OD | [mm] | outerDiameterMm |
| 12 | Groot Weefsel | Type | bigWovenType |
| 13 | Groot Weefsel | Lengte | bigWovenLengthMm |
| 14 | (leeg) | Breedte | bigWovenWidthMm |
| 15 | Aantal | [-] | totalBig |
| 16+ | (vrije tekst/notities) |  | moldNote |

Validatie Manhole:
- Verplicht: pressureBar, innerDiameterMm, socketLengthMm
- Als lengte of breedte '-' is: markeren als warning en record niet automatisch active voor productie
- Notities als 'Geen Mal' of 'Geen ger.tekening' altijd opslaan als blockingWarning

## 6. Mapping - Codification

Doel: code-tabellen voor codering/decodering, niet als productregel.

Structuur is key-value georiënteerd (geen gewone rijenmatrix):
- Rij 1-2 bevat labels voor codekolommen
- Vanaf rij 3 paren uitlezen:
  - ID waarde <-> code (bijv. 25 <-> 02)
  - PN waarde <-> code (bijv. 8 <-> G)
  - Laagdikte waarde <-> code (bijv. 360 <-> 0.3)

Advies opslag:
- codification.idMap
- codification.pnMap
- codification.layerMap

Validatie Codification:
- Geen dubbele sleutel in dezelfde map
- Sleutels en waarden als string opslaan (geen verlies van voorloopnullen)

## 7. Mapping - Revision

Doel: metadata + revision log.

1. Document-metadata (bovenste blok):
- versionLabel (bijv. Version 4)
- versionDate
- author
- users

2. Revision log (vanaf rij 7):
- revisionCode (bijv. Revision 2)
- description
- author

Validatie Revision:
- Minimaal 1 revision-regel vereist
- Laatste revisionCode als sourceRevision voor importbatch gebruiken

## 8. Mapping - Design Endcap >1500mm

Doel: businessregelbron, geen tabelimport.

Regelset:
- For Length > 1500 mm: Big Woven Roving rectangular
- For Length <= 1500 mm: Big Woven Roving square

Opslag:
- endcapRules.largeDiameterMode = rectangular_if_gt_1500_else_square
- sourceSheet = Design Endcap >1500mm

## 9. Niet-import sheets voor datarecords (template-only)

Sheets:
- Glass_Endcap_DU
- Glass_Endcap_EN
- Glass_Bottom_DU
- Glass_Bottom_EN

Gebruik:
- Visuele proces-/print-template referentie
- Tekstblokken DU/EN voor printlabels en werkblad-layout
- Geen row-based productrecords importeren uit deze sheets

## 10. Unieke sleutel en deduplicatie

Aanbevolen unieke sleutel per producttype:

1. Tee:
- productType + family + connectionType + pressureBar + innerDiameterMm + branchDiameterMm

2. Endcap:
- productType + pressureBar + innerDiameterMm + domeWallThicknessMm + knuckleWallThicknessMm

3. Manhole:
- productType + pressureBar + innerDiameterMm + socketLengthMm

Bij sleutelconflict binnen dezelfde importbatch:
- laatste rij wint
- conflict als warning loggen met beide sourceRow referenties

## 11. Importstatus en publicatie

1. Eerste import:
- Eenmalige baseline import van hele workbook
- Status = active na error-vrije validatie

2. Volgende imports:
- Altijd nieuwe revision batch
- Publicatie alleen bij zero errors
- Vorige active batch -> archived

3. Auditvelden per record:
- importedAt
- importedBy
- sourceFileName
- sourceSheet
- sourceRow
- sourceRevision

## 12. Open punten voor engineering bevestiging

1. Endcap PL kolom 20/22/23 betekenis exact valideren (Extra TE / Knuckle berekening)
2. Manhole Bottom vrije kolommen vanaf 16 formeel classificeren als notes of extra geometrie
3. Special sheet: bevestigen of afwijkende items aparte productSubType krijgen
4. Definitieve beslisregel wanneer manhole/endcap record blocked moet worden bij ontbrekende mal/tekening
