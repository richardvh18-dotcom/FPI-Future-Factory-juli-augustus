const fs = require('fs');

const hubFile = 'src/components/digitalplanning/BM01Hub.tsx';
let c = fs.readFileSync(hubFile, 'utf8');

// 1. Add import
const imp = `import { OrderRecord, ProductRecord, SidebarEntry, FinishPayload, DeliveryMismatch } from './bm01/bm01Types';\nimport { useBM01Data } from './bm01/useBM01Data';\n`;
c = c.replace(/type TimestampLike = \{/, imp + 'type TimestampLike = {');
c = c.replace(/type DeliveryMismatch = \{[\s\S]*?\};\n/, '');

// 2. Remove states
const states = [
    `const [archivedProducts, setArchivedProducts] = useState<ProductRecord[]>([]);`
];
states.forEach(s => c = c.replace(s, ''));

// 3. Extract logic
const sStr = '    const planningOrders = useMemo(() => {';
const midStr = '  const completedProducts = useMemo(() => {';
const eStr = '    });\n  }, [products, archivedProducts, selectedDate, viewMode]);';
const start = c.indexOf(sStr);
const midIdx = c.indexOf(midStr, start);
const end = c.indexOf(eStr, midIdx) + eStr.length;

if (start === -1 || end === -1 + eStr.length) {
    console.log("Could not find block");
    process.exit(1);
}

let block = c.slice(start, end);

// preserve specific handlers
const getHandler = (code, startStr, endStr) => {
    const s = code.indexOf(startStr);
    if (s === -1) return '';
    const e = code.indexOf(endStr, s) + endStr.length;
    return code.slice(s, e);
};

const removeHandler = (code, startStr, endStr) => {
    const s = code.indexOf(startStr);
    if (s === -1) return code;
    const e = code.indexOf(endStr, s) + endStr.length;
    return code.slice(0, s) + code.slice(e);
};

const h1 = getHandler(block, 'const handleNahardingBatchComplete = async () => {', 'setIsNahardingBatchProcessing(false);\n    };');
const h2 = getHandler(block, 'const handleSidebarSelect = async (entry: SidebarEntry | null) => {', 'setSelectedOrderId(entry.id || entryOrderId);\n    };');
const h3 = getHandler(block, 'const handleOpenArchivedLotDossier = async (lotNumber: string) => {', 'lotNumber: lot || selectedSidebarEntry.lotNumber,\n        });\n    };');

// 4. Build replacement
const hookCall = `
    const {
        planningOrders,
        deliveryInspectionMismatches,
        deliveryInspectionOverMismatches,
        deliveryInspectionUnderMismatches,
        visibleDeliveryInspectionMismatches,
        selectedOrder,
        selectedDetailEntry,
        selectedSidebarEntryId,
        bm01Products,
        nahardingProducts,
        latestNahardingBatchDateKey,
        nahardingBatchProducts,
        latestNahardingBatchLabel,
        archivedProducts,
        nahardingPrintList,
        completedProducts,
        getNahardingOfferedMillis
    } = useBM01Data({
        orders, products, selectedOrderId, selectedSidebarEntry, activeTab, selectedDate, viewMode, lastNahardingResetAt, deliveryMismatchFilter
    });

${h2}

${h3}

${h1}
`;

c = c.slice(0, start) + hookCall + c.slice(end);

// 5. Remove helpers
const helperStart = 'const archiveColPath = (year: number) => collection(db, getPathString(getArchiveItemsPath(year)));';
const helperEnd = 'return isValid(date) ? date : null;\n};';
const hs = c.indexOf(helperStart);
const he = c.indexOf(helperEnd, hs);
if (hs !== -1 && he !== -1) {
    c = c.slice(0, hs) + c.slice(he + helperEnd.length);
}

fs.writeFileSync(hubFile, c);
console.log("Success");
