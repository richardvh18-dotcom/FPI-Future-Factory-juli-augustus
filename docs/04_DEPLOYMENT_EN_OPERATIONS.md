# 4. Deployment & Operations

Dit document bevat de procedures voor het deployen van de applicatie, het beheren van omgevingen, en operationele noodscenario's (SOPs).

---

## 1. Firebase Deployment (Productie)

De applicatie wordt gehost via Firebase (Hosting voor de React/Vite frontend, Functions voor backend logica).

### Volledige Productie Deploy
Om alles (frontend, functies, en database regels) naar productie te pushen:

```bash
# 1. Zorg dat je op de 'main' of 'FpiFF-Pilot-Ready' branch zit
git checkout main
git pull origin main

# 2. Bump de versie
npm version patch # of minor/major

# 3. Bouw de productie frontend
npm run build

# 4. Deploy naar Firebase
firebase deploy --only hosting,functions
```

> **Let op:** In dit project draait het script `scripts/verify-build-output.cjs` automatisch bij een build. Dit voorkomt dat een corrupte (lege) `dist/` map naar Firebase wordt verstuurd, wat zou resulteren in een 404 voor eindgebruikers.

---

## 2. Preview Environments (Vercel-stijl)

Voor het testen van feature branches (zoals `preview-v2`) kun je tijdelijke Firebase Hosting URL's genereren, onafhankelijk van productie. 

> ⚠️ **Database Waarschuwing:** Deze preview URL's verbinden standaard **wel** met de productie Firestore database. Test geen destructieve data-migraties op een preview channel!

### Handmatig een Preview Channel aanmaken
```bash
# Bouw de app
npm run build

# Deploy naar een uniek kanaal (bijv. "preview-v2")
firebase hosting:channel:deploy preview-v2
```
Je ontvangt dan een tijdelijke URL (bijv. `future-factory...preview-v2.web.app`) die standaard na 7 dagen vervalt.

### GitHub Actions (CI/CD)
Wanneer je een Pull Request opent, creëert GitHub Actions automatisch een preview deploy via `.github/workflows/firebase-hosting-preview.yml`. Zodra de PR gemerged is naar `main`, volgt er een automatische productie deploy.

---

## 3. Operations & Noodherstel (Restore SOP)

*(Zie ook `RESTORE_SOP.md` als deze aanwezig is voor uitgebreide details).*

### Firestore Rollbacks
Als de database corrupt raakt door een foute release:
1. Open de Google Cloud Console (Firestore sectie).
2. Gebruik de PITR (Point-in-Time Recovery) functionaliteit, of laad een recente nightly backup in.
3. Bij het inladen van een backup, zorg dat niemand de applicatie actief gebruikt om write-conflicten te voorkomen.

### Corrupte Release Terugdraaien
Als een front-end release een fatale bug bevat:
1. Ga naar de **Firebase Console > Hosting**.
2. Zoek in de release-historie naar de laatst werkende versie.
3. Klik op **Rollback**. Deze actie is direct merkbaar voor gebruikers.
