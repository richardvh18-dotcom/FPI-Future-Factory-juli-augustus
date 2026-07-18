# Plan voor Overdracht van Eigenaarschap (GitHub & Firebase)

## Huidige Situatie
Het pilotproject (de GitHub repository en het Firebase project) is momenteel gekoppeld aan een persoonlijk Gmail-adres.

## Doel
Het eigenaarschap en het dagelijks beheer overdragen naar bedrijfsaccounts binnen het `@futurepipe.com` domein, met de volgende opzet:
1. Een **Hoofdaccount** (`bijv. admin@futurepipe.com`): Dit wordt de officiële eigenaar van de projecten.
2. Een **Persoonlijk account** (`bijv. richard@futurepipe.com`): Dit account krijgt beheerders-/ontwikkelaarsrechten om in te loggen en dagelijks aan de code te werken, zonder het hoofdaccount te hoeven gebruiken.

---

## Stappenplan GitHub

### Stap 1: Accounts Voorbereiden
- Maak een GitHub-account aan voor het **Hoofdaccount** (bijv. `futurepipe-admin`).
- Maak een GitHub-account aan voor je **Persoonlijke account** (bijv. `richard-futurepipe`).

### Stap 2: Repository Overdragen (Transfer)
1. Log in op GitHub met je **huidige persoonlijke Gmail-account** (de huidige eigenaar).
2. Ga naar de repository `FPI-Future-Factory-juli-augustus`.
3. Ga naar het tabblad **Settings** en scrol helemaal naar beneden naar de **Danger Zone**.
4. Klik op **Transfer ownership**.
5. Vul de GitHub-gebruikersnaam in van het nieuwe **Hoofdaccount** en bevestig de overdracht.
6. Log in op het e-mailadres van het Hoofdaccount om de transfer via de e-maillink te accepteren. Vanaf nu is het Hoofdaccount eigenaar.

### Stap 3: Persoonlijk Account Toevoegen als Collaborator
1. Log in op het GitHub **Hoofdaccount**.
2. Ga naar de overgedragen repository > **Settings** > **Collaborators**.
3. Klik op **Add people** en voeg je **Persoonlijke account** toe als 'Admin' of 'Write' collaborator.
4. Accepteer de uitnodiging via de e-mail van je persoonlijke account.
5. *Resultaat:* Het Hoofdaccount bezit de code, maar jij kunt via je eigen werkaccount alles pushen en beheren.

---

## Stappenplan Firebase

### Stap 1: Accounts Voorbereiden
Zorg dat zowel het Hoofdaccount als het Persoonlijke account werken als Google-accounts. *(Als `@futurepipe.com` gebruikmaakt van Google Workspace, is dit standaard al het geval. Zo niet, dan moet je deze mailadressen registreren als een Google-account).*

### Stap 2: Nieuwe Eigenaar (Hoofdaccount) Toevoegen
1. Log in op de [Firebase Console](https://console.firebase.google.com/) met je **huidige persoonlijke Gmail-account**.
2. Ga naar het project. Klik linksboven op het tandwieltje (**Project Settings**) en kies **Users and permissions**.
3. Klik op **Add member**.
4. Vul het e-mailadres van het **Hoofdaccount** in.
5. Selecteer bij Rollen de rol **Owner** (Eigenaar) en klik op **Done/Add member**.
6. Firebase stuurt een uitnodiging. Accepteer deze via de mailbox van het Hoofdaccount.

### Stap 3: Persoonlijk Account Toevoegen
1. Blijf in het **Users and permissions** scherm en klik nogmaals op **Add member**.
2. Vul het e-mailadres van je **Persoonlijke account** in.
3. Geef dit account de rol **Editor** of **Firebase Admin** (of ook *Owner*, afhankelijk van hoeveel rechten je nodig hebt voor dagelijks beheer). Accepteer ook deze uitnodiging.

### Stap 4: Oude Eigenaar Verwijderen (Optioneel maar aanbevolen)
1. Log in op de Firebase Console met het **Hoofdaccount**.
2. Ga naar **Project Settings** > **Users and permissions**.
3. Zoek je oorspronkelijke privé Gmail-account in de lijst op en verwijder deze. Nu is de overdracht 100% afgerond en veilig gesteld.

---

## Gevolgen & Actiepunten Lokaal (Jouw Computer)
Nadat deze online stappen zijn voltooid, moet je je lokale ontwikkelomgeving (deze laptop/pc) even updaten zodat deze je nieuwe werkaccount gebruikt in plaats van je oude privéaccount:

1. **Git / GitHub:**
   - Genereer een nieuwe *Personal Access Token (PAT)* of *SSH Key* voor je nieuwe **persoonlijke** GitHub-account.
   - Update je lokale credentials. Als je daarna `git push` doet, zal dit op naam staan van je nieuwe werk-account.
2. **Firebase CLI:**
   - Als je vanuit de terminal (VS Code) Firebase gebruikt (bijv. voor hosting), typ dan in de terminal:
     ```bash
     firebase logout
     ```
   - En log vervolgens opnieuw in met je nieuwe persoonlijke account:
     ```bash
     firebase login
     ```
