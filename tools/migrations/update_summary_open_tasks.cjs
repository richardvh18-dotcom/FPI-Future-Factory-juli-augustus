const fs = require('fs');
const path = 'd:/Antygravity/FPI-Future-Factory-juli-augustus/docs/CONVERSATION_SUMMARY.md';
let content = fs.readFileSync(path, 'utf8');

const openTasks = `### 📋 Openstaande Taken & Geplande Roadmap

**Hieronder vind je de gebundelde openstaande taken en wensen uit eerdere sessies:**

1. **Beveiliging & Firestore (Prioriteit)**
   - Firestore rules hardenen (implementatie van RBAC via custom claims).
   - Geplande Firestore-exports inrichten en een periodieke restore-test inbouwen.

2. **Codebase Opschonen (Fase 4)**
   - Console logs en openstaande TODO's opruimen in de productiepaden (Log cleanup).

3. **Internationalisatie (i18n)**
   - Start de i18n vertaling voor \`src/components/planning/AutomationRulesView.jsx\` (vervangen van vaste teksten door \`t()\` calls).

4. **Documentatie**
   - Eventueel extra inhoudelijke slides toevoegen aan het Kennis Centrum / de Dashboard Roadmap.

---

`;

// Voeg de openstaande taken toe bovenaan (onder een eventuele file header of direct bovenaan)
content = openTasks + content;

fs.writeFileSync(path, content, 'utf8');
console.log("CONVERSATION_SUMMARY.md updated with open tasks at the top.");
