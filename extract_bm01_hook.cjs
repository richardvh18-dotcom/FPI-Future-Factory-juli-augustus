const fs = require('fs');
const path = require('path');

const hubPath = path.join(__dirname, 'src/components/digitalplanning/BM01Hub.tsx');
const hookPath = path.join(__dirname, 'src/components/digitalplanning/bm01/useBM01Data.ts');

let content = fs.readFileSync(hubPath, 'utf8');

// Match from `const planningOrders = useMemo` until the end of `completedProducts` useMemo.
const startRegex = /const planningOrders = useMemo\(\(\) => \{/;
const endRegex = /return tB - tA;\s*\}\);\s*\}, \[products, archivedProducts, selectedDate, viewMode\]\);/;

const startMatch = content.match(startRegex);
const endMatch = content.match(endRegex);

if (!startMatch || !endMatch) {
  console.error("Extraction markers not found in BM01Hub.tsx");
  process.exit(1);
}

const startIndex = startMatch.index;
const endIndex = endMatch.index + endMatch[0].length;

const extractedLogic = content.substring(startIndex, endIndex);

const hookCode = `import { useState, useEffect, useMemo } from "react";
import { collection, query, where, getDocs, onSnapshot, limit } from "firebase/firestore";
import { db } from "../../../config/firebase";
import { PATHS, getArchiveItemsPath, getPathString } from "../../../config/dbPaths";
import { isValid, isSameDay, startOfISOWeek, endOfISOWeek, isWithinInterval, format } from "date-fns";

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
    deliveryMismatchFilter,
    setViewingDossier,
    setSelectedOrderId,
    setSelectedSidebarEntry
}: any) => {

    const [archivedProducts, setArchivedProducts] = useState<any[]>([]);

    const toMillisSafe = (value: any) => toMillisFromMixed(value);

    const getNahardingOfferedMillis = (item: any) => {
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

    ${extractedLogic.replace(/const getNahardingOfferedMillis = [^]*?return 0;\n    };\n/g, '').replace(/handleSidebarSelect/g, 'handleSidebarSelectInternal').replace(/handleOpenArchivedLotDossier/g, 'handleOpenArchivedLotDossierInternal')}

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
        getNahardingOfferedMillis,
        archiveColPath,
        toMillisFromMixed,
        toDateFromMixed,
        handleSidebarSelect: handleSidebarSelectInternal,
        handleOpenArchivedLotDossier: handleOpenArchivedLotDossierInternal
    };
};
`;

fs.writeFileSync(hookPath, hookCode);
console.log("Hook useBM01Data.ts created.");
