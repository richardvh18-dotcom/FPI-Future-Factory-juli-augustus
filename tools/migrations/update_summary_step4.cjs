const fs = require('fs');
const path = 'd:/Antygravity/FPI-Future-Factory-juli-augustus/docs/CONVERSATION_SUMMARY.md';
let content = fs.readFileSync(path, 'utf8');

const newEntry = `### Update sessie 09 July 2026 (Terminal.tsx Acties Refactor)

**Datum:** 09 July 2026 | **Branch:** FPiFF-June-rolout

**Uitgevoerd (Stap 4 Voltooid):**
- De actie logica in \`Terminal.tsx\` (o.a. scannen, productie starten, tekeningen openen, reparaties afhandelen) is succesvol geëxtraheerd naar een nieuwe custom hook: \`src/components/digitalplanning/terminal/useTerminalActions.ts\`.
- \`Terminal.tsx\` roept deze hook nu aan en geeft de gegenereerde functies en states door, waardoor het bestand sterk is vereenvoudigd tot een schone UI-wrapper.
- Zowel TypeScript validatie (\`npx tsc --noEmit\`) als linting (\`npm run lint\`) zijn gepasseerd na de herstructurering.

**Resultaat:**
- \`Terminal.tsx\` is vrijgemaakt van zware bedrijfslogica. Het "Centralisatie AI-services en prompt management" voor deze component is daarmee succesvol verwezenlijkt.

---

`;

content = newEntry + content;
fs.writeFileSync(path, content, 'utf8');
console.log("CONVERSATION_SUMMARY.md updated successfully.");
