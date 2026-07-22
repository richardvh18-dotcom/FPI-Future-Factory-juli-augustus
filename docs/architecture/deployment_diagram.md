# Deployment Architectuur

Dit diagram toont hoe de applicatie gedeployed is en hoe de verschillende infrastructuur-componenten (Google Cloud / Firebase / GitHub) met elkaar verbonden zijn.

```mermaid
architecture-beta
    group github(logos:github)[GitHub]
    group gcp(logos:google-cloud)[Google Cloud / Firebase]
    group client(logos:react)[Client (Browser / iPad)]

    service repo(logos:git)[Repository] in github
    service actions(logos:github-actions)[GitHub Actions] in github
    service hosting(logos:firebase)[Firebase Hosting] in gcp
    service firestore(logos:firebase)[Cloud Firestore] in gcp
    service functions(logos:firebase)[Cloud Functions] in gcp
    service auth(logos:firebase)[Firebase Auth] in gcp
    service app(logos:react)[Web App (Vite/React)] in client

    repo:R --> L:actions
    actions:R --> L:hosting
    actions:B --> T:functions

    app:R --> L:hosting
    app:R --> L:auth
    app:R --> L:firestore
    app:R --> L:functions
    
    functions:R --> L:firestore
```

## Beschrijving
- **Client App**: Een React/Vite applicatie (vaak gebruikt op iPads en werkstations op de werkvloer).
- **GitHub Actions**: Zorgt voor Continuous Integration (linting, tests) en Continuous Deployment (automatisch uitrollen naar Firebase Hosting).
- **Firebase Hosting**: Serveert de statische React bundels.
- **Cloud Firestore**: De NoSQL real-time database, afgeschermd via WORM-based security rules.
- **Cloud Functions**: Bevat callables voor veilige operaties (bijv. Audit Logging, Automation Engine).
- **Firebase Auth**: Verwerkt inloggegevens (e-mail/wachtwoord of Azure AD).
