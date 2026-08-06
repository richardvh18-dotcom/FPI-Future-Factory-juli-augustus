const fs = require('fs');
const path = 'src/components/digitalplanning/modals/ProductionStartModal.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Remove OperatorPrintRule type
code = code.replace(/type OperatorPrintRule = \{[\s\S]*?\};\n/, '');

// 2. Remove resolveOperatorPrintRule function
code = code.replace(/const resolveOperatorPrintRule = \([\s\S]*?\n\};\n/, '');

// 3. Remove matchedOperatorPrintRule useMemo
code = code.replace(/  const matchedOperatorPrintRule = useMemo\([\s\S]*?\n  \);\n/, '');

// 4. Remove usage at line 417
code = code.replace(/      if \(!shouldUseFlangeLabelFlow && typeof matchedOperatorPrintRule\?\.labelCount === "number" && matchedOperatorPrintRule\.labelCount > 0\) \{\n        initialCount = matchedOperatorPrintRule\.labelCount;\n      \}\n/, '');

// 5. Remove usage at line 425
code = code.replace(/if \(isBh18Station\(stationId\) && !matchedOperatorPrintRule\) \{/g, 'if (isBh18Station(stationId)) {');

// 6. Dependencies
code = code.replace(/matchedOperatorPrintRule, /g, '');

// 7. ruleCodeTag = ""
code = code.replace(/const ruleCodeTag = String\(matchedOperatorPrintRule\?\.code \|\| ""\)\.trim\(\)\.toUpperCase\(\);/g, 'const ruleCodeTag = "";');

// 8. else if (matchedOperatorPrintRule?.labelSize)
code = code.replace(/          \} else if \(matchedOperatorPrintRule\?\.labelSize\) \{\n             preferLarge = matchedOperatorPrintRule\.labelSize === "large";\n/g, '');

// 9. BH18 labelSize
code = code.replace(/if \(stationId === 'BH18' && !matchedOperatorPrintRule\?\.labelSize\) \{/g, "if (stationId === 'BH18') {");

// 10. operatorForcedLabels
code = code.replace(/      const operatorForcedLabels = !isFlangeOrder && typeof matchedOperatorPrintRule\?\.labelCount === "number" && matchedOperatorPrintRule\.labelCount > 0\n        \? matchedOperatorPrintRule\.labelCount/g, '      const operatorForcedLabels = null');

// 11. Remove matchedOperatorPrintRule?.code from deps
code = code.replace(/matchedOperatorPrintRule\?\.code/g, '');

fs.writeFileSync(path, code, 'utf8');
console.log('ProductionStartModal.tsx refactored successfully.');
