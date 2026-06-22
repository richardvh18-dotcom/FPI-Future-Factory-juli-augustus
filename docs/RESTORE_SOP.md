# Standaard Operationele Procedure (SOP): Firestore Herstel (Restore)

Deze procedure beschrijft de stappen om Firestore-gegevens te herstellen vanuit een geëxporteerde backup in Google Cloud Storage. Backups worden dagelijks automatisch gegenereerd en bewaard in de bucket `gs://[PROJECT_ID]-firestore-backups`.

## Waarschuwingen vooraf (ISO 27001)

> [!CAUTION]
> Een hersteloperatie overschrijft bestaande documenten met de versies uit de backup. Als er na de backup nieuwe wijzigingen zijn gemaakt in die documenten, gaan deze verloren (Data Loss). Communiceer herstelacties ALTIJD vooraf met productie.

> [!WARNING]
> Voer een test-restore uit naar een afgescheiden (staging) project indien mogelijk, voordat de live productieomgeving wordt overschreven.

## Vereisten
1. Toegang tot Google Cloud Console met de rol `Datastore Import Export Admin`.
2. Toegang tot de Google Cloud Shell, of de gcloud CLI lokaal geïnstalleerd en geauthenticeerd.

---

## Stap 1: Zoek de juiste backup
1. Ga naar **Google Cloud Storage** in de GCP Console.
2. Open de bucket: `[PROJECT_ID]-firestore-backups`.
3. Zoek de map met de datum van de gewenste backup (bijv. `2024-11-20T23:00:00_41234`).
4. Noteer de exacte `gs://` URI, deze ziet er zo uit:
   `gs://[PROJECT_ID]-firestore-backups/2024-11-20T23:00:00_41234`

## Stap 2: Voer de import (restore) uit via Cloud Shell

Open de Cloud Shell en voer het volgende commando uit. Dit zal de hele database terugdraaien naar het tijdstip van de export.

```bash
gcloud firestore import gs://[PROJECT_ID]-firestore-backups/[MAP_NAAM] --async
```

*Optioneel:* Als je alleen een specifieke collectie wilt herstellen (bijv. alleen de planning of gebruikers):

```bash
gcloud firestore import gs://[PROJECT_ID]-firestore-backups/[MAP_NAAM] --collection-ids='future-factory' --async
```

## Stap 3: Controleer de voortgang
Je krijgt een `operation` ID terug. Je kunt de voortgang bekijken in de GCP Console onder **Datastore > Import/Export**, of via de CLI:

```bash
gcloud firestore operations describe [OPERATION_ID]
```

## Stap 4: Verificatie (QC)
1. Log in op de FPiFF portal.
2. Controleer visueel in het Planning Dashboard of de records correct zijn teruggezet.
3. Controleer de Audit Logs in Firestore (`future-factory/audit/logs`) om te valideren dat de logs inacta zijn tot het moment van de backup.
4. Informeer teamleiders en engineers dat de herstelactie is voltooid en productie kan worden hervat.

---
**Eigenaar procedure:** IT Beheer / Productie Administratie
**Laatst geüpdatet:** Juni 2026
