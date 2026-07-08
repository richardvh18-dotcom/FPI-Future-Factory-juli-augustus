const fs = require('fs');
const path = require('path');

const hubPath = path.join(__dirname, 'src/components/digitalplanning/BM01Hub.tsx');
const hookPath = path.join(__dirname, 'src/components/digitalplanning/bm01/useBM01Data.ts');

let hubContent = fs.readFileSync(hubPath, 'utf8');

// 1. Remove types from BM01Hub and add import
const typeStartRegex = /type TimestampLike = \{/;
const typeEndRegex = /type DeliveryMismatch = \{[\s\S]*?\};\n/;

const tStartMatch = hubContent.match(typeStartRegex);
const tEndMatch = hubContent.match(typeEndRegex);

if (tStartMatch && tEndMatch) {
    const tStart = tStartMatch.index;
    const tEnd = tEndMatch.index + tEndMatch[0].length;
    hubContent = hubContent.substring(0, tStart) + 
        `import { OrderRecord, ProductRecord, SidebarEntry, FinishPayload, DeliveryMismatch } from './bm01/bm01Types';\nimport { useBM01Data } from './bm01/useBM01Data';\n` + 
        hubContent.substring(tEnd);
}

// Remove state definitions that will be moved to hook
const stateToRemove = [
    `const [archivedProducts, setArchivedProducts] = useState<ProductRecord[]>([]);`
];
stateToRemove.forEach(state => {
    hubContent = hubContent.replace(state, '');
});

// 2. Extract data logic to hook
const startExtract = /const planningOrders = useMemo\(\(\) => \{/;
const endExtract = /return tB - tA;\s*\}\);\s*\}, \[products, archivedProducts, selectedDate, viewMode\]\);/;

const sMatch = hubContent.match(startExtract);
const eMatch = hubContent.match(endExtract);

if (sMatch && eMatch) {
    const startIdx = sMatch.index;
    const endIdx = eMatch.index + eMatch[0].length;
    let extracted = hubContent.substring(startIdx, endIdx);

    // Remove handleNahardingBatchComplete, handleSidebarSelect, handleOpenArchivedLotDossier from the extracted string
    // because we want them to stay in BM01Hub.tsx
    
    // We will find their positions in 'extracted' and splice them out
    const removeBlock = (code, startRegex, endRegex) => {
        const sMatch = code.match(startRegex);
        if (!sMatch) return code;
        const eMatch = code.match(endRegex);
        if (!eMatch) return code;
        const eIdx = eMatch.index + eMatch[0].length;
        return code.substring(0, sMatch.index) + code.substring(eIdx);
    };

    extracted = removeBlock(extracted, /const handleNahardingBatchComplete = async \(\) => \{/, /setIsNahardingBatchProcessing\(false\);\n    \};/);
    extracted = removeBlock(extracted, /const handleSidebarSelect = async \(entry: SidebarEntry \| null\) => \{/, /setSelectedOrderId\(entry\.id \|\| entryOrderId\);\n    \};/);
    extracted = removeBlock(extracted, /const handleOpenArchivedLotDossier = async \(lotNumber: string\) => \{/, /lotNumber: lot \|\| selectedSidebarEntry\.lotNumber,\n        \}\);\n    \};/);

    // Create the hook file
    const hookCode = `import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, onSnapshot, limit } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS, getArchiveItemsPath, getPathString } from "../../../config/dbPaths";
import { isValid, isSameDay, startOfISOWeek, endOfISOWeek, isWithinInterval, format } from "date-fns";
import { nl } from "date-fns/locale";
import { OrderRecord, ProductRecord, SidebarEntry, DeliveryMismatch } from "./bm01Types";

const toMillisFromMixed = (value: any): number => {
    if (!value) return 0;
    if (typeof value === "object" && value !== null && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
    if (typeof value === "object" && value !== null && "seconds" in value && typeof value.seconds === "number") return value.seconds * 1000;
    if (value instanceof Date) return value.getTime();
    if (typeof value !== "string" && typeof value !== "number") return 0;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
};

const toDateFromMixed = (value: any): Date | null => {
    const millis = toMillisFromMixed(value);
    if (!millis) return null;
    const date = new Date(millis);
    return isValid(date) ? date : null;
};

const archiveColPath = (year: number) => collection(db, getPathString(getArchiveItemsPath(year)));

export const useBM01Data = ({
    orders,
    products,
    selectedOrderId,
    selectedSidebarEntry,
    activeTab,
    selectedDate,
    viewMode,
    lastNahardingResetAt,
    deliveryMismatchFilter
}: any) => {
    const [archivedProducts, setArchivedProducts] = useState<ProductRecord[]>([]);

    const toMillisSafe = (value: any) => toMillisFromMixed(value);

    const getNahardingOfferedMillis = (item: ProductRecord) => {
        const ts = item?.timestamps || {};
        const directTs =
            toMillisSafe(ts.oven_naharding_start)
            || toMillisSafe(ts.naharding_start)
            || 0;
        if (directTs > 0) return directTs;

        const historyList = Array.isArray(item?.history) ? item.history : [];
        const nahardingEvent = historyList.find((entry: any) => {
            const details = String(entry?.details || "").toUpperCase();
            const station = String(entry?.station || "").toUpperCase();
            const action = String(entry?.action || "").toUpperCase();
            if (details.includes("GEREEDGEMELD") || action === "ARCHIVE" || action === "COMPLETED") return false;
            return details.includes("NAHARD") || details.includes("OVEN") ||
                   station.includes("NAHARD") || station.includes("OVEN") ||
                   action.includes("NAHARD");
        });
        const historyTs = toMillisSafe(nahardingEvent?.timestamp || nahardingEvent?.time);
        if (historyTs > 0) return historyTs;

        const station = String(item?.currentStation || "").toUpperCase().replace(/\\s/g, "");
        const step = String(item?.currentStep || "").toUpperCase().replace(/\\s/g, "");
        const status = String(item?.status || "").toUpperCase().trim();
        const lastStation = String(item?.lastStation || "").toUpperCase().replace(/\\s/g, "");
        const isLegacyQcVirtual = Boolean(item?.isVirtualLot) && (step === "QC_VIRTUAL" || status === "QC VIRTUAL ISSUED");

        const isNahardingRelated =
            station.includes("NAHARD") || station.includes("OVEN") ||
            step.includes("NAHARD") || step.includes("OVEN") ||
            status === "TE NAHARDEN" ||
            isLegacyQcVirtual ||
            lastStation.includes("NAHARD") || lastStation.includes("OVEN");

        if (isNahardingRelated) {
            const isFinished = status === "COMPLETED" || station === "GEREED";
            if (isFinished) {
                return toMillisSafe(item?.createdAt);
            }
            return toMillisSafe(item?.updatedAt) || toMillisSafe(item?.createdAt);
        }
        return 0;
    };

    ${extracted}

    return {
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
        setArchivedProducts,
        nahardingPrintList,
        completedProducts,
        getNahardingOfferedMillis
    };
};
`;

    // Wait, the extracted chunk might contain duplicates of getNahardingOfferedMillis and toMillisSafe
    // So we must remove them from the 'extracted' chunk before adding it to hookCode!
    const cleanExtracted = hookCode
        .replace(/const toMillisSafe = \(value: unknown\) => toMillisFromMixed\(value\);\n\n    const getNahardingOfferedMillis = \([\s\S]*?return 0;\n    };\n/, '');

    fs.writeFileSync(hookPath, cleanExtracted);

    // Replace logic in hub with hook call
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
`;

    const getBlock = (code, startRegex, endRegex) => {
        const sMatch = code.match(startRegex);
        if (!sMatch) return '';
        const eMatch = code.match(endRegex);
        if (!eMatch) return '';
        const eIdx = eMatch.index + eMatch[0].length;
        return code.substring(sMatch.index, eIdx);
    };

    const block1 = getBlock(hubContent.substring(startIdx, endIdx), /const handleNahardingBatchComplete = async \(\) => \{/, /setIsNahardingBatchProcessing\(false\);\n    \};/);
    const block2 = getBlock(hubContent.substring(startIdx, endIdx), /const handleSidebarSelect = async \(entry: SidebarEntry \| null\) => \{/, /setSelectedOrderId\(entry\.id \|\| entryOrderId\);\n    \};/);
    const block3 = getBlock(hubContent.substring(startIdx, endIdx), /const handleOpenArchivedLotDossier = async \(lotNumber: string\) => \{/, /lotNumber: lot \|\| selectedSidebarEntry\.lotNumber,\n        \}\);\n    \};/);

    const finalHandlers = '\\n' + block2 + '\\n\\n' + block3 + '\\n\\n' + block1 + '\\n';

    hubContent = hubContent.substring(0, startIdx) + hookCall + finalHandlers + hubContent.substring(endIdx);
    
    const helpersRegex = /const archiveColPath = [^]*?return isValid\(date\) \? date : null;\n};\n/g;
    hubContent = hubContent.replace(helpersRegex, '');

    fs.writeFileSync(hubPath, hubContent);
    console.log("Successfully extracted data logic to useBM01Data.ts");
} else {
    console.log("Could not find start/end bounds for extraction.");
}
