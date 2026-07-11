const fs = require('fs');
const path = require('path');

const dataHookPath = path.join(__dirname, 'src/components/digitalplanning/terminal/useTerminalData.ts');

let content = fs.readFileSync(dataHookPath, 'utf8');

// Remove UI imports (accounting for \r\n)
const uiImportsToRemove = [
  './modals/ProductReleaseModal',
  './modals/ProductionStartModal',
  '../products/ProductDetailModal',
  './LossenView',
  './Nabewerken',
  './terminal/TerminalPlanningView',
  './terminal/TerminalProductionView',
  './terminal/TerminalManualInput',
  './terminal/TerminalGereedTab',
  './MalOptimizationPanel',
  './MazakView',
  './modals/RepairModal'
];

uiImportsToRemove.forEach(imp => {
  const regex = new RegExp(`import .* from "${imp}";\\r?\\n`, 'g');
  content = content.replace(regex, '');
});

fs.writeFileSync(dataHookPath, content);
console.log('Fixed imports round 2');
