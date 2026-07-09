const fs = require('fs');
const path = require('path');

const terminalPath = path.join(__dirname, 'src/components/digitalplanning/Terminal.tsx');
let content = fs.readFileSync(terminalPath, 'utf8');

// 1. Remove duplicate `useState`
content = content.replace(/  const \[allOrders, setAllOrders\] = useState<PlanningOrder\[\]>\(\[\]\);\r?\n/, '');
content = content.replace(/  const \[allTracked, setAllTracked\] = useState<TrackedProductDoc\[\]>\(\[\]\);\r?\n/, '');
content = content.replace(/  const \[archiveTrackedItems, setArchiveTrackedItems\] = useState<TrackedProductDoc\[\]>\(\[\]\);\r?\n/, '');
content = content.replace(/  const \[loading, setLoading\] = useState\(true\);\r?\n/, '');

// 2. Add useTerminalData import if it's missing
if (!content.includes('import { useTerminalData }')) {
  content = content.replace(
    'import { shouldHidePlanningOrder } from "../../utils/terminalOrderFilters";',
    'import { shouldHidePlanningOrder } from "../../utils/terminalOrderFilters";\nimport { useTerminalData } from "./terminal/useTerminalData";'
  );
}

// 3. Remove duplicate stationCounterField
content = content.replace(/  const stationCounterField = getStartedCounterField\(effectiveStationId \|\| stationId\);\r?\n/, '');

// 4. Fix implicit any on lotNumber find
content = content.replace(
  'const foundProduct = allTracked.find((p) => p.lotNumber === pendingQcSteekproefLot);',
  'const foundProduct = allTracked.find((p: any) => p.lotNumber === pendingQcSteekproefLot);'
);


// 5. Cut out the massive data block
const startMarker = "// Real-time Data Sync - ONLY for tracked products";
const endMarker = "// Handlers";
const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error("Markers not found");
  process.exit(1);
}

const beforeBlock = content.substring(0, startIndex);
const afterBlock = content.substring(endIndex);

const hookCall = `
  const terminalData = useTerminalData({
    initialStation,
    orders,
    planningSearch,
    wikkelenSearch,
    lossenPlanningFilter,
    referenceDate,
    showAllWeeks
  });

  const {
    allOrders, allTracked, archiveTrackedItems, loading, setLoading,
    stationCounterField,
    stationOrderMeta, madeCountMap, myOrders, productionProgressMap, rejectedCountMap, readyForReturnMap, waitingForLossenMap,
    activeWikkelingen, lotConflictMeta, repairItems, filteredOrders, lossenFilteredOrders
  } = terminalData;

  const selectedOrder = useMemo(() => {
    const planningSource = isLossen1218Station ? lossenFilteredOrders : filteredOrders;
    const fromPlanning = planningSource.find(
      (o: any) => o.id === selectedOrderId || o.orderId === selectedOrderId
    );
    if (fromPlanning) return fromPlanning;
    return myOrders.find(
      (o: any) => o.id === selectedOrderId || o.orderId === selectedOrderId
    ) || null;
  }, [isLossen1218Station, lossenFilteredOrders, filteredOrders, myOrders, selectedOrderId]);

  const selectedWikkeling = useMemo(() => activeWikkelingen.find((p: any) => p.id === selectedTrackedId), [activeWikkelingen, selectedTrackedId]);

  // Scan handler voor wikkelen tab
  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const code = scanInput.trim();
      if (!code) return;
      const codeUpper = code.toUpperCase();
      if (codeUpper === "FPI-ACTION-APPROVE-OK") {
        const isWikkelenStep = (selectedWikkeling?.currentStep || "").toLowerCase() === "wikkelen";
        if (!isBH18) {
          notify(String(t("digitalplanning.terminal.ok_qr_not_available")) as never);
          setScanInput("");
          return;
        }
        if (selectedWikkeling && isWikkelenStep) {
          setProductToRelease(selectedWikkeling);
          setBulkProductsToRelease([]);
          setReleaseAutoApproveToken(Date.now());
          setScanInput("");
        } else {
          notify(String(t("digitalplanning.terminal.select_active_bh18_before_qr")) as never);
          setScanInput("");
        }
        return;
      }
      
      const found = activeWikkelingen.find((i: any) => 
        (i.lotNumber || "").toLowerCase() === code.toLowerCase() || 
        (i.orderId || "").toLowerCase() === code.toLowerCase()
      );
      if (found) {
        setSelectedTrackedId(found.id);
        setScanInput("");
      } else {
        notify(String(t("digitalplanning.terminal.item_not_found_active_winding")) as never);
        setScanInput("");
      }
    }
  };

`;

fs.writeFileSync(terminalPath, beforeBlock + hookCall + afterBlock);
console.log("Terminal.tsx updated flawlessly again");
