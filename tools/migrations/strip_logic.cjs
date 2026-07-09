const fs = require('fs');
const path = 'src/components/admin/AdminLabelLogic.tsx';
let code = fs.readFileSync(path, 'utf8');

// Remove OperatorPrintRule types
code = code.replace(/type OperatorPrintRule = \{[\s\S]*?\n\};\n\n/, '');
code = code.replace(/const createPrintRuleId = \(\) => `\$\{Date\.now\(\)\}_\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 8\)\}`;/, '');
code = code.replace(/const normalizePrintRule = \([\s\S]*?\n\};\n/g, '');
code = code.replace(/const normalizePrintRules = \([\s\S]*?\n\};\n/g, '');
code = code.replace(/const buildPrintRuleSignature = \([\s\S]*?\n\};\n/g, '');
code = code.replace(/const dedupePrintRulesByContent = \([\s\S]*?\n\};\n/g, '');

// Remove printRules state
code = code.replace(/  const \[printRules, setPrintRules\] = useState<OperatorPrintRule\[\]>\(\[\]\);\n/, '');
code = code.replace(/  const \[savedPrintRules, setSavedPrintRules\] = useState<OperatorPrintRule\[\]>\(\[\]\);\n/, '');
code = code.replace(/  const \[hasUnsavedPrintRuleChanges, setHasUnsavedPrintRuleChanges\] = useState\(false\);\n/, '');
code = code.replace(/  const \[activeEditSavedRuleId, setActiveEditSavedRuleId\] = useState<string \| null>\(null\);\n/, '');
code = code.replace(/  const \[isSavingPrintRules, setIsSavingPrintRules\] = useState\(false\);\n/, '');

// Remove printRules from settings sync
code = code.replace(/        const normalizedRules = normalizePrintRules\(settings\?\.labelPrintRules\);\n        setSavedPrintRules\(normalizedRules\);\n        if \(!hasUnsavedPrintRuleChanges\) \{\n          setPrintRules\(\[\]\);\n          setActiveEditSavedRuleId\(null\);\n        \}\n/, '');

// Remove hasUnsavedPrintRuleChanges from deps
code = code.replace(/, hasUnsavedPrintRuleChanges/g, '');

// Remove printRules functions
code = code.replace(/  const addPrintRule = \(\) => \{[\s\S]*?const persistLabelPrintRules = async \(rulesToPersist: OperatorPrintRule\[\]\) => \{[\s\S]*?\}\n    \);\n  \};\n/g, '');

fs.writeFileSync(path, code, 'utf8');
console.log('AdminLabelLogic.tsx stripped of print rules.');
