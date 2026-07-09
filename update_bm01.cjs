const fs = require('fs');

const path = 'd:/Antygravity/FPI-Future-Factory-juli-augustus/src/components/digitalplanning/BM01Hub.tsx';
let content = fs.readFileSync(path, 'utf8');

// Add imports
const importsToAdd = `
import BM01InspectionTab from "./bm01/BM01InspectionTab";
import BM01HistoryTab from "./bm01/BM01HistoryTab";
import BM01NahardingTab from "./bm01/BM01NahardingTab";
`;

if (!content.includes('import BM01InspectionTab')) {
    content = content.replace('import { useBM01Data } from "./bm01/useBM01Data";', 'import { useBM01Data } from "./bm01/useBM01Data";' + importsToAdd);
}

// Replace inspectie tab
const inspectieStart = content.indexOf(') : activeTab === "inspectie" ? (');
const mismatchStart = content.indexOf(') : (\\n            <div className="h-full flex flex-col p-4 overflow-y-auto">');

if (mismatchStart === -1) {
    console.log("Fallback search for mismatch:");
    const match = content.match(/\) : \(\s*<div className="h-full flex flex-col p-4 overflow-y-auto">/);
    if (match) {
        console.log("Found mismatch at index", match.index);
    } else {
        console.log("Still could not find mismatch block.");
    }
}

const match = content.match(/\) : \(\s*<div className="h-full flex flex-col p-4 overflow-y-auto">/);

if (inspectieStart > -1 && match) {
    const replacement = `) : activeTab === "inspectie" ? (
            <BM01InspectionTab
                bm01Products={bm01Products}
                selectedProduct={selectedProduct}
                scanInput={scanInput}
                setScanInput={setScanInput}
                scannerMode={scannerMode}
                setScannerMode={setScannerMode}
                scanInputRef={scanInputRef}
                handleScan={handleScan}
                isTouchDevice={isTouchDevice}
                touchKeyboardPreferred={touchKeyboardPreferred}
                setTouchKeyboardPreferred={setTouchKeyboardPreferred}
                handleItemClick={handleItemClick}
                scheduleScanFocus={scheduleScanFocus}
            />
        ) : activeTab === "completed" ? (
            <BM01HistoryTab
                completedProducts={completedProducts}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                viewMode={viewMode}
                setViewMode={setViewMode}
                handleExport={handleExport}
                setShowPrintModal={setShowPrintModal}
                setViewingDossier={setViewingDossier}
                toDateFromMixed={toDateFromMixed}
            />
        ) : activeTab === "naharding_batch" ? (
            <BM01NahardingTab
                nahardingBatchProducts={nahardingBatchProducts}
                latestNahardingBatchLabel={latestNahardingBatchLabel}
                isNahardingBatchProcessing={isNahardingBatchProcessing}
                handleNahardingBatchComplete={handleNahardingBatchComplete}
                viewMode={viewMode}
                setViewMode={setViewMode}
                nahardingPrintList={nahardingPrintList}
                lastNahardingResetAt={lastNahardingResetAt}
                setLastNahardingResetAt={setLastNahardingResetAt}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                setShowPrintModal={setShowPrintModal}
                nahardingProducts={nahardingProducts}
            />
        `;

    const contentBefore = content.substring(0, inspectieStart);
    const contentAfter = content.substring(match.index);

    content = contentBefore + replacement + contentAfter;
    fs.writeFileSync(path, content, 'utf8');
    console.log("BM01Hub.tsx updated successfully.");
} else {
    console.log("Could not find the necessary blocks to replace.");
}
