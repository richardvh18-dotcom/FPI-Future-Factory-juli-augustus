const fs = require('fs');
const pathVars = 'src/components/admin/AdminLabelVariables.tsx';
let codeVars = fs.readFileSync(pathVars, 'utf8');

// Remove types
codeVars = codeVars.replace(/type OperatorPrintRule = \{[\s\S]*?\};\n\n\n\n/, '');
codeVars = codeVars.replace(/const normalizePrintRule = \([\s\S]*?^const formatRuleValue/m, 'const formatRuleValue');

// Remove printRules states
codeVars = codeVars.replace(/  const \[printRules, setPrintRules\] = useState<OperatorPrintRule\[\]>\(\[\]\);\n/, '');
codeVars = codeVars.replace(/  const \[savedPrintRules, setSavedPrintRules\] = useState<OperatorPrintRule\[\]>\(\[\]\);\n/, '');
codeVars = codeVars.replace(/  const \[hasUnsavedPrintRuleChanges, setHasUnsavedPrintRuleChanges\] = useState\(false\);\n/, '');
codeVars = codeVars.replace(/  const \[activeEditSavedRuleId, setActiveEditSavedRuleId\] = useState<string \| null>\(null\);\n/, '');
codeVars = codeVars.replace(/  const \[isSavingPrintRules, setIsSavingPrintRules\] = useState\(false\);\n/, '');

// Remove sync logic
codeVars = codeVars.replace(/        const normalizedRules = normalizePrintRules\(settings\?\.labelPrintRules\);\n        setSavedPrintRules\(normalizedRules\);\n        if \(!hasUnsavedPrintRuleChanges\) \{\n          setPrintRules\(\[\]\);\n          setActiveEditSavedRuleId\(null\);\n        \}\n/, '');

// Remove addPrintRule to persistLabelPrintRules
codeVars = codeVars.replace(/  const addPrintRule = \(\) => \{[\s\S]*?  return \(\n/m, '  return (\n');

// Remove JSX for operatorPrintRules
// The section starts around line 863 and ends near 1010.
// Let's just remove everything from `{t("adminLabelLogic.operatorPrintRules", "Operator printregels")}` to the end of that section.
// Actually, it's safer to just do a blanket regex:
codeVars = codeVars.replace(/              \{t\("adminLabelLogic\.operatorPrintRules"[\s\S]*?\{t\("adminLabelLogic\.savedRulesOverview"[\s\S]*?<\/div>\n            \)\}\n          <\/div>\n/m, '');
// Let me be more careful about the JSX. I can just use AST or manual editing if needed.
// For now, let's just write the modified content.

fs.writeFileSync(pathVars, codeVars, 'utf8');

const pathAuto = 'src/components/planning/AutomationRulesView.tsx';
let codeAuto = fs.readFileSync(pathAuto, 'utf8');
codeAuto = codeAuto.replace(/      \{\/\* --- NIEUW: TAB NAVIGATIE --- \*\/\}[\s\S]*?<\/div>\n/, '');
// Wait, I need to remove the tab buttons.
codeAuto = codeAuto.replace(/      <div className="flex gap-2 border-b border-slate-200 mb-6 pb-1">[\s\S]*?<\/div>\n/, '');
// And remove activeTab state
codeAuto = codeAuto.replace(/  const \[activeTab, setActiveTab\] = useState\("automation"\); \/\/ "automation" \| "labels"\n/, '');
fs.writeFileSync(pathAuto, codeAuto, 'utf8');

console.log('Cleanup script finished.');
