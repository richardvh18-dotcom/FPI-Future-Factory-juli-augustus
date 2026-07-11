const fs = require('fs');
const path = require('path');

const terminalPath = path.join(__dirname, 'src/components/digitalplanning/Terminal.tsx');
const dataHookPath = path.join(__dirname, 'src/components/digitalplanning/terminal/useTerminalData.ts');
const actionsHookPath = path.join(__dirname, 'src/components/digitalplanning/terminal/useTerminalActions.ts');

const content = fs.readFileSync(terminalPath, 'utf8');

// We will copy the entire content into useTerminalData as a starting point,
// so we don't lose any type definitions or complex hooks.
fs.writeFileSync(dataHookPath, content);
fs.writeFileSync(actionsHookPath, content);

console.log("Done copying");
