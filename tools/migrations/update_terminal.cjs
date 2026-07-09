const fs = require('fs');
const path = 'd:/Antygravity/FPI-Future-Factory-juli-augustus/src/components/digitalplanning/Terminal.tsx';
let content = fs.readFileSync(path, 'utf8');

// Voeg de import toe
content = content.replace('import { useTerminalData } from "./terminal/useTerminalData";', 'import { useTerminalData } from "./terminal/useTerminalData";\\nimport { useTerminalActions } from "./terminal/useTerminalActions";');

// Zoek het begin van de states om te verwijderen
const stateStart = content.indexOf('const [showStartModal, setShowStartModal] = useState(false);');
const stateEnd = content.indexOf('// Scan functionaliteit voor wikkelen tab');

if (stateStart > -1 && stateEnd > -1) {
    const contentBeforeState = content.substring(0, stateStart);
    const contentAfterState = content.substring(stateEnd);
    content = contentBeforeState + contentAfterState;
}

// Nu zoek de handlers om te verwijderen
const handlersStart = content.indexOf('// Scan handler voor wikkelen tab');
const handlersEnd = content.indexOf('if (loading) return (');

if (handlersStart > -1 && handlersEnd > -1) {
    const contentBeforeHandlers = content.substring(0, handlersStart);
    const contentAfterHandlers = content.substring(handlersEnd);

    const callHook = `
  const {
    showStartModal,
    setShowStartModal,
    productToRelease,
    setProductToRelease,
    bulkProductsToRelease,
    setBulkProductsToRelease,
    releaseAutoApproveToken,
    setReleaseAutoApproveToken,
    viewingProduct,
    setViewingProduct,
    showRepairModal,
    setShowRepairModal,
    itemToRepair,
    setItemToRepair,
    releaseDefaultStatus,
    setReleaseDefaultStatus,
    releaseDefaultReasons,
    setReleaseDefaultReasons,
    handleScan,
    handleOpenReleaseModal,
    handleViewDrawing,
    handleStartProduction,
    handleRepair,
    handleRepairComplete,
  } = useTerminalActions({
    user,
    notify,
    effectiveStationId: effectiveStationId as string,
    stationName: stationName as string | undefined,
    isBH18,
    isNabewerking,
    isLossenStation,
    isBM01,
    isBH31,
    activeTab,
    setActiveTab,
    allTracked: allTracked as any[],
    activeWikkelingen: activeWikkelingen as any[],
    selectedWikkeling,
    setSelectedTrackedId,
    scanInput,
    setScanInput,
  });

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };
  
  `;

    content = contentBeforeHandlers + callHook + contentAfterHandlers;
    
    // Verwijder onnodige imports in Terminal.tsx
    content = content.replace('import { queuePrintJob, startProductionLots } from "../../services/planningSecurityService";\\nimport { completeTrackedProductRepair } from "../../services/planningSecurityService";', '');
    
    fs.writeFileSync(path, content, 'utf8');
    console.log("Terminal.tsx updated successfully.");
} else {
    console.log("Could not find blocks to replace.");
}
