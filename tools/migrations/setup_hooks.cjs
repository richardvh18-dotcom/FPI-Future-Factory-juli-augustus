const fs = require('fs');
const path = require('path');

const terminalPath = path.join(__dirname, 'src/components/digitalplanning/Terminal.tsx');
const dataHookPath = path.join(__dirname, 'src/components/digitalplanning/terminal/useTerminalData.ts');
const actionsHookPath = path.join(__dirname, 'src/components/digitalplanning/terminal/useTerminalActions.ts');

const content = fs.readFileSync(terminalPath, 'utf8');

// 1. Create useTerminalData.ts
// Replace component declaration
let dataContent = content.replace(
  /const Terminal = \(\{ initialStation, onCancelProduction, orders = \[\] \}: TerminalProps\) => \{/,
  `export const useTerminalData = ({ initialStation, orders = [], planningSearch, wikkelenSearch, lossenPlanningFilter, referenceDate, showAllWeeks }: any) => {`
);

// Find the return block and replace it
const returnIndex = dataContent.indexOf('  if (loading) return (');
if (returnIndex !== -1) {
  const everythingBeforeReturn = dataContent.substring(0, returnIndex);
  
  const returnBlock = `
  return {
    stationId, stationName, effectiveStationId, normalizedStationId, cleanStationId,
    isNabewerking, isMazak, isLossen1218Station, isLossenStation, isSimpleViewStation, isBH18, isGereedTabSourceStation, isBH31, isBM01,
    allOrders, allTracked, archiveTrackedItems, loading, setLoading,
    targetWeekNum, targetYearNum, currentRealDate, currentRealWeek, currentRealYear, absCurrentReal, appId, stationCounterField,
    stationOrderMeta, madeCountMap, myOrders, productionProgressMap, rejectedCountMap, readyForReturnMap, waitingForLossenMap,
    activeWikkelingen, lotConflictMeta, repairItems, filteredOrders, lossenFilteredOrders
  };
};
`;
  
  dataContent = everythingBeforeReturn + returnBlock;
}

// Write the file
fs.writeFileSync(dataHookPath, dataContent);

// 2. Create useTerminalActions.ts
// Just a stub for now that we can populate
const actionsContent = `
import { useState, useCallback } from "react";
import { logActivity } from "../../../config/firebase";
import { queuePrintJob, startProductionLots, completeTrackedProductRepair } from "../../../services/planningSecurityService";

export const useTerminalActions = ({ user, effectiveStationId, stationName, activeTab, setActiveTab }: any) => {
  // Logic will be extracted here
  return {};
};
`;
fs.writeFileSync(actionsHookPath, actionsContent);

console.log("Hooks generated successfully!");
