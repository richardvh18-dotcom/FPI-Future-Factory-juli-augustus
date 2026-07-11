const fs = require('fs');

function fixAdminLabelVariables() {
  const path = 'src/components/admin/AdminLabelVariables.tsx';
  let code = fs.readFileSync(path, 'utf8');

  code = code.replace(/type GeneralSettings = \{[\s\S]*?labelPrintRules\?: OperatorPrintRule\[\];\n\};\n\ntype OperatorPrintRule = \{[\s\S]*?\};\n/, 'type GeneralSettings = {\n  codes?: string[];\n};\n');
  code = code.replace(/const normalizePrintRule = \([\s\S]*?const formatRuleValue/m, 'const formatRuleValue');
  
  // The block in useEffect
  code = code.replace(/        const normalizedRules = normalizePrintRules\(settings\?\.labelPrintRules\);\n        setSavedPrintRules\(normalizedRules\);\n        if \(!hasUnsavedPrintRuleChanges\) \{\n          setPrintRules\(\[\]\);\n          setActiveEditSavedRuleId\(null\);\n        \}\n/, '');

  // The functions
  const fnMatch = code.indexOf('  const addPrintRule = () => {');
  const returnMatch = code.indexOf('  return (\n    <div className="h-full grid');
  if (fnMatch !== -1 && returnMatch !== -1) {
    code = code.slice(0, fnMatch) + code.slice(returnMatch);
  }

  // State variables
  code = code.replace(/  const \[printRules, setPrintRules\] = useState<OperatorPrintRule\[\]>\(\[\]\);\n/, '');
  code = code.replace(/  const \[savedPrintRules, setSavedPrintRules\] = useState<OperatorPrintRule\[\]>\(\[\]\);\n/, '');
  code = code.replace(/  const \[hasUnsavedPrintRuleChanges, setHasUnsavedPrintRuleChanges\] = useState\(false\);\n/, '');
  code = code.replace(/  const \[activeEditSavedRuleId, setActiveEditSavedRuleId\] = useState<string \| null>\(null\);\n/, '');
  code = code.replace(/  const \[isSavingPrintRules, setIsSavingPrintRules\] = useState\(false\);\n/, '');

  fs.writeFileSync(path, code, 'utf8');
}

function fixAutomationRules() {
  const path = 'src/components/planning/AutomationRulesView.tsx';
  let code = fs.readFileSync(path, 'utf8');
  
  code = code.replace(/const \[activeTab, setActiveTab\] = useState\("automation"\); \/\/ "automation" \| "labels"/, '');
  code = code.replace(/      \) : \([\s\S]*?<AdminLabelPrintRules \/>[\s\S]*?      \)\}\n    <\/div>/, '    </div>');
  code = code.replace(/      <\/div>\n    <\/div>/, '    </div>');

  fs.writeFileSync(path, code, 'utf8');
}

fixAdminLabelVariables();
fixAutomationRules();
console.log('Fixed');
