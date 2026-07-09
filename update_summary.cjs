const fs = require('fs');

const path = 'd:/Antygravity/FPI-Future-Factory-juli-augustus/docs/CONVERSATION_SUMMARY.md';
let content = fs.readFileSync(path, 'utf8');

const newEntry = `### Update sessie 09 July 2026 (BM01Hub.tsx Refactor Afronding)

**Datum:** 09 July 2026 | **Branch:** FPiFF-June-rolout

**Uitgevoerd (Stap 3 Voltooid):**
- De gigantische \`BM01Hub.tsx\` (~1550 regels) succesvol opgedeeld in kleinere, onderhoudbare componenten.
- Drie nieuwe tab-componenten gecreëerd in \`src/components/digitalplanning/bm01/\`:
  - \`BM01InspectionTab.tsx\` (UI voor QA inspecties, afkeuringslogica en steekproeven)
  - \`BM01HistoryTab.tsx\` (UI voor archiefweergave en lot-historie)
  - \`BM01NahardingTab.tsx\` (UI voor naharding, exportresets en labels printen)
- \`BM01Hub.tsx\` fungeert nu enkel als orkestrator die de state beheert via \`useBM01Data\` en delegeert naar de juiste child component.
- Zowel TypeScript validatie (\`npx tsc --noEmit\`) als linting (\`npm run lint\`) zijn naadloos gepasseerd.

**Resultaat:**
- \`BM01Hub.tsx\` is nu schoon, leesbaar en strikt getypeerd, waarmee de technische schuld van deze component volledig is afgelost.

---

`;

content = newEntry + content;
fs.writeFileSync(path, content, 'utf8');
console.log("CONVERSATION_SUMMARY.md updated successfully.");
