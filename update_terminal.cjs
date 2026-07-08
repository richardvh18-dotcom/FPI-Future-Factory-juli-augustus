const fs = require('fs');
const path = require('path');

const terminalPath = path.join(__dirname, 'src/components/digitalplanning/Terminal.tsx');
let content = fs.readFileSync(terminalPath, 'utf8');

// The start of the block to remove
const startMarker = "// Real-time Data Sync - ONLY for tracked products (orders come from prop)";
// The end of the block to remove (first line of handlers)
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
    effectiveStationId, normalizedStationId, cleanStationId,
    isNabewerking, isMazak, isLossen1218Station, isLossenStation, isSimpleViewStation, isBH18, isGereedTabSourceStation, isBH31, isBM01,
    allOrders, allTracked, archiveTrackedItems, loading, setLoading,
    targetWeekNum, targetYearNum, currentRealDate, currentRealWeek, currentRealYear, absCurrentReal, appId, stationCounterField,
    stationOrderMeta, madeCountMap, myOrders, productionProgressMap, rejectedCountMap, readyForReturnMap, waitingForLossenMap,
    activeWikkelingen, lotConflictMeta, repairItems, filteredOrders, lossenFilteredOrders
  } = terminalData;

  // Sync ref met state
  useEffect(() => {
    // Add logic if needed, or rely on hook
  }, []);

`;

// Don't forget to add the import at the top of Terminal.tsx
const importStatement = `import { useTerminalData } from "./terminal/useTerminalData";\n`;
let finalContent = beforeBlock + hookCall + afterBlock;
if (!finalContent.includes('useTerminalData')) {
  finalContent = importStatement + finalContent;
} else {
  finalContent = finalContent.replace('import React, {', importStatement + 'import React, {');
}

fs.writeFileSync(terminalPath, finalContent);
console.log("Terminal.tsx updated");
