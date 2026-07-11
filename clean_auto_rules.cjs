const fs = require('fs');
const path = 'src/components/planning/AutomationRulesView.tsx';
let code = fs.readFileSync(path, 'utf8');

// 1. Remove import
code = code.replace(/import AdminLabelPrintRules from "\.\.\/admin\/AdminLabelPrintRules";\n/, '');

// 2. We can just replace the bottom part starting from {/* --- NIEUW: TAB NAVIGATIE --- */} to the end of the return statement.
const splitPoint = '      {/* --- NIEUW: TAB NAVIGATIE --- */}';
if (code.includes(splitPoint)) {
  const parts = code.split(splitPoint);
  let bottomPart = parts[1];
  
  // We need to keep everything inside the `activeTab === "automation"` block, but remove the tab logic.
  // Actually, since I know the structure:
  // The bottom part is basically the rules grid and the Info Panel.
  // Let's just do an exact match replacement.
}

// Safer way: just remove the activeTab state entirely and clean up the render manually.
code = code.replace(/const \[activeTab, setActiveTab\] = useState\("automation"\); \/\/ "automation" \| "labels"/g, '');
code = code.replace(/      \{\/\* --- NIEUW: TAB NAVIGATIE --- \*\/\}[\s\S]*?      \} \? \(/, '');
code = code.replace(/      \) : \([\s\S]*?<AdminLabelPrintRules \/>[\s\S]*?      \)\}\n    <\/div>/, '    </div>');
code = code.replace(/        <div className="animate-in fade-in duration-300">\n/, '');
code = code.replace(/      <\/div>\n    <\/div>/, '    </div>');

fs.writeFileSync(path, code, 'utf8');
console.log('AutomationRulesView.tsx cleaned up.');
