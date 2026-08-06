const fs = require('fs');
const pathVariables = 'src/components/admin/AdminLabelVariables.tsx';
let varsCode = fs.readFileSync(pathVariables, 'utf8');

varsCode = varsCode.replace(/AdminLabelLogic/g, 'AdminLabelVariables');
fs.writeFileSync(pathVariables, varsCode, 'utf8');

const pathManager = 'src/components/admin/AdminLabelManager.tsx';
let mgrCode = fs.readFileSync(pathManager, 'utf8');

// 1. Update imports
mgrCode = mgrCode.replace(/import AdminLabelLogic from "\.\/AdminLabelLogic";/, 'import AdminLabelVariables from "./AdminLabelVariables";\nimport AdminLabelPrintRules from "./AdminLabelPrintRules";');

// 2. Update state type
mgrCode = mgrCode.replace(/const \[activeTab, setActiveTab\] = useState<"designer" \| "logic" \| "templates">/, 'const [activeTab, setActiveTab] = useState<"designer" | "logic" | "printRules" | "templates">');

// 3. Add Tab Button for Print Rules
const newTabBtn = `          <button
            onClick={() => setActiveTab("printRules")}
            className={\`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all \${
              activeTab === "printRules"
                ? "bg-white text-purple-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }\`}
          >
            <Settings size={14} /> <span className="hidden sm:inline">{t('common.printRules', 'Print Regels')}</span>
          </button>\n          <button
            onClick={() => setActiveTab("templates")}`;
mgrCode = mgrCode.replace(/          <button\n            onClick=\{\(\) => setActiveTab\("templates"\)\}/, newTabBtn);

// 4. Rename Logic tab text
mgrCode = mgrCode.replace(/<span className="hidden sm:inline">\{t\('common.logic'\)\}<\/span>/, '<span className="hidden sm:inline">{t(\'common.logic\', \'Variabelen\')}</span>');

// 5. Render AdminLabelVariables instead of AdminLabelLogic
mgrCode = mgrCode.replace(/             <AdminLabelLogic \/>/, '             <AdminLabelVariables />');

// 6. Render AdminLabelPrintRules block
const printRulesBlock = `        {activeTab === "printRules" && (
          <div className="h-full overflow-y-auto p-3 sm:p-4 md:p-6 bg-slate-100">
             <div className="max-w-6xl mx-auto"><AdminLabelPrintRules /></div>
          </div>
        )}
        {activeTab === "templates" && (`
mgrCode = mgrCode.replace(/        \{activeTab === "templates" && \(/, printRulesBlock);

fs.writeFileSync(pathManager, mgrCode, 'utf8');
console.log('AdminLabelManager.tsx refactored successfully.');
