import React from "react";
import OrderDetail from "./OrderDetail";
import ArchivedOrderDetailPanel from "./ArchivedOrderDetailPanel";
import OrderDetailPlaceholder from "./OrderDetailPlaceholder";

/**
 * TeamleaderDetailPane — right-side detail column of TeamleaderHub.
 * Shows OrderDetail when an active order is selected, ArchivedOrderDetailPanel
 * when an archived order entry is selected, or a placeholder when nothing is selected.
 */
const TeamleaderDetailPane = React.memo(({
  selectedOrder,
  selectedSidebarEntry,
  onClose,
  handleMoveLot,
  setViewingDossier,
  targetSlug,
  effectiveStations,
  rawProducts,
  archivedHistoryProducts,
  handleOpenArchivedLotDossier,
  selectedDetailEntry,
}) => {
  return (
    <div className={`flex-1 bg-white rounded-[40px] border border-slate-200 shadow-sm flex flex-col overflow-hidden ${selectedDetailEntry ? 'flex' : 'hidden lg:flex'}`}>
      {selectedOrder ? (
        <OrderDetail
          order={selectedOrder}
          products={[...rawProducts, ...archivedHistoryProducts]}
          onClose={onClose}
          isManager={true}
          onMoveLot={handleMoveLot}
          onOpenDossier={setViewingDossier}
          showAllStations={true}
          currentDepartment={targetSlug}
          allowedStations={effectiveStations}
        />
      ) : selectedSidebarEntry?.isArchivedOrder ? (
        <ArchivedOrderDetailPanel
          selectedSidebarEntry={selectedSidebarEntry}
          onClose={onClose}
          onOpenArchivedLotDossier={handleOpenArchivedLotDossier}
        />
      ) : (
        <OrderDetailPlaceholder />
      )}
    </div>
  );
});

TeamleaderDetailPane.displayName = "TeamleaderDetailPane";

export default TeamleaderDetailPane;
