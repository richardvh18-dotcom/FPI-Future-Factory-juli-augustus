import { collection, collectionGroup, query, onSnapshot, doc, serverTimestamp, where, limit, getDocs, getDoc, arrayUnion, increment, addDoc, updateDoc } from "firebase/firestore";
import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Loader2, Menu, X, Clock, Calendar, UserCheck, AlertTriangle } from "lucide-react";
import { useNFCReader, NFC_STATUS } from "../../hooks/useNFCReader";
import { db, logActivity } from "../../config/firebase";
import { PATHS, getArchiveItemsPath, getPathString } from "../../config/dbPaths";
import {
  rejectTrackedProductFinal,
  completeTrackedProduct,
  cancelTrackedProduction,
  moveTrackedProductManual,
  tempRejectTrackedProduct,
  advanceTrackedProduct,
  startWorkstationProductionRun,
  completeTrackedProductRepair,
  routeTrackedProductsToLossen,
  toggleTrackedProductPause,
  markTrackedProductReminder,
  linkPlanningOrderProduct,
  saveOccupancyAssignments,
  saveOccupancyAssignment,
  savePersonnelRecord,
  createProductionMessages,
} from "../../services/planningSecurityService";
import { useAdminAuth } from "../../hooks/useAdminAuth";
import { getAuth } from "firebase/auth";
import { useNotifications } from "../../contexts/NotificationContext";

import { getISOWeek, startOfISOWeek } from "date-fns";
import {
  WORKSTATIONS,
  getISOWeekInfo,
  isInspectionOverdue,
} from "../../utils/workstationLogic";
import { normalizeMachine, FITTING_MACHINES, PIPE_MACHINES, getStartedCounterField } from "../../utils/hubHelpers";
import { toDateSafe } from "../../utils/dateUtils";
import ActiveProductionView from "./views/ActiveProductionView";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import { useWorkstationStore } from "./useWorkstationStore";
import { WorkstationModals } from "./WorkstationModals";

import Terminal from "./Terminal";
import Nabewerken from "./Nabewerken";
import LossenView from "./LossenView";
import MazakView from "./MazakView";
import GereedView from "./GereedView";
import BM01Hub from "./BM01Hub";

import {
  TimestampLike, DateValue, PlanningOrder, TrackedProductDoc,
  mergeTrackedProductDocs, OccupancyEntry, DowntimeRecord,
  StartProductionOptions, StartProductionResult, MoveLotOptions,
  PostProcessingPayload, RepairCompletePayload, RoutingToLossenResult,
  DocSnapLike, PersonnelEntry, AppUser, WorkstationHubProps,
  getAppId, LOSSEN_1218_SOURCE_STATIONS, LOSSEN_1218_STATION_NAME,
  AUTO_LOSSEN_1218_SOURCE_STATIONS, getLossenRoute, getTodayString,
  getYesterdayString, isDateWithinInclusiveRange, normalizePlanningStatus,
  isInactivePlanningStatus, toFiniteNumber, SHIFT_CONFIG, ShiftKey,
  getShiftEffectiveStart, getCurrentShiftKey, getCurrentShiftLabel,
  shiftMatchesBucket, resolveShiftKeyFromPerson
} from "./WorkstationTypes";
import { useWorkstationState } from "../../hooks/useWorkstationState";
import { WorkstationHeader } from "./WorkstationHeader";
import { useLocation } from "react-router-dom";

const WorkstationHub = ({ initialStationId, onExit }: WorkstationHubProps) => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const searchOrder = searchParams.get("order") || undefined;

  const state = useWorkstationState({ initialStationId, onExit, searchOrder });

  const {
    currentUserId,
    navigate,
    initialStationName,
    handleOperatorCheckout,
    selectedStation,
    setSelectedStation,
    activeTab,
    setActiveTab,
    rawOrders,
    setRawOrders,
    rawProducts,
    setRawProducts,
    occupancy,
    setOccupancy,
    personnel,
    setPersonnel,
    loading,
    setLoading,
    dataSourceRefreshKey,
    setDataSourceRefreshKey,
    archivedStats,
    setArchivedStats,
    backgroundTrackingUnsubRef,
    backgroundTrackingTimerRef,
    visibleRawProducts,
    currentDate,
    currentWeekInfo,
    isMobileMenuOpen,
    setIsMobileMenuOpen,
    checkedInOperator,
    setCheckedInOperator,
    dismissedPromptShift,
    setDismissedPromptShift,
    timeHeartbeat,
    setTimeHeartbeat,
    activeDowntime,
    setActiveDowntime,
    toggleMachineStoring,
    lastShiftRef,
    logWorkstationActivity,
    nfcPendingBadgeRef,
    handleOperatorShiftCheckinRef,
    nfc,
    lastAutoCheckoutMinuteRef,
    lastAppliedInitialStationRef,
    currentAppId,
    isPostProcessing,
    isBM01,
    isLossen1218Station,
    requiresShiftCheckin,
    currentShiftKey,
    requestNotificationPermission,
    showInstallInstructions,
    isPWA,
    getShiftColor,
    isShiftActive,
    stationOccupancy,
    handleOperatorShiftCheckin,
    handleSaveHourCorrection,
    currentOperatorIndex,
    setCurrentOperatorIndex,
    stationActivityByOrder,
    stationOrders,
    stationStats,
    activeUnitsHere,
    selectedStationNormForHeader,
    selectedStationCleanForHeader,
    isBm01HeaderStation,
    isWorkstationGereedTab,
    isTwoKpiHeaderStation,
    todoHeaderLabel,
    handleBack,
    handleStartProduction,
    handleMoveLot,
    handlePauseResume,
    handleLinkProduct,
    handlePostProcessingFinish,
    handleProcessUnit,
    handleRepairComplete,
    handleOpenProductInfo,
    handleActiveUnitClick,
    handleCancelProduction,
    pullStartY,
    setPullStartY,
    pullDistance,
    setPullDistance,
    isRefreshing,
    setIsRefreshing,
    contentRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    t,
    currentUser,
    showSuccess,
    showError,
    showInfo,
    showWarning,
    requestBrowserPermission,
    showConfirm,
    notify,
    WORKSTATIONS
  } = state;
  return (
    <>
    <div className="flex flex-col w-full h-[100dvh] bg-slate-50 text-slate-900">
      <WorkstationHeader state={state} />
      {/* CONTENT AREA */}
      <div 
        ref={contentRef}
        className={`flex-1 overflow-y-auto w-full bg-white ${activeTab === 'terminal' ? 'p-0' : 'p-2 sm:p-6 lg:p-8'} relative`}
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Pull to Refresh Indicator */}
        {(pullDistance > 0 || isRefreshing) && (
          <div 
            className="absolute top-4 left-0 w-full flex justify-center z-50 pointer-events-none"
            style={{ 
              transform: `translateY(${isRefreshing ? 10 : Math.max(0, pullDistance - 30)}px)`,
              opacity: Math.min(pullDistance / 40, 1),
              transition: isRefreshing ? 'transform 0.2s' : 'none'
            }}
          >
            <div className="bg-white p-2 rounded-full shadow-lg border border-slate-100">
              <Loader2 
                className={`text-blue-600 ${isRefreshing || pullDistance > 60 ? 'animate-spin' : ''}`} 
                size={24} 
                style={{ transform: !isRefreshing ? `rotate(${pullDistance * 3}deg)` : undefined }}
              />
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col justify-center items-center h-full gap-4">
            <Loader2 className="animate-spin rounded-full h-12 w-12 text-blue-600" />
            <div className="text-center">
              <p className="text-sm font-bold text-slate-600 uppercase tracking-wide">
                {t("digitalplanning.workstation.loading_station")} {selectedStation}
              </p>
              <p className="text-xs text-slate-400 mt-1">{t("digitalplanning.workstation.loading_data")}</p>
            </div>
          </div>
        ) : (!currentUser?.role || currentUser?.role === 'guest') ? (
          <div className="flex flex-col justify-center items-center h-full text-slate-400">
            <div className="p-6 bg-white rounded-2xl shadow-sm border border-slate-200 text-center max-w-md">
              <h3 className="text-lg font-black uppercase tracking-widest text-slate-700 mb-2">{t("digitalplanning.workstation.account_pending_title")}</h3>
              <p className="text-sm font-medium mb-6">{t("digitalplanning.workstation.account_pending_message")}</p>
              <button onClick={handleBack} className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-wider transition-colors">
                {t("digitalplanning.workstation.back_to_portal")}
              </button>
            </div>
          </div>
        ) : (
          <>
            {activeTab === "winding" && (
              ((selectedStation || "").toUpperCase().replace(/\s/g, "").includes("NABEWERK")) ? (
            <Nabewerken products={visibleRawProducts} orders={rawOrders} />
              ) : (
                <ActiveProductionView
                activeUnits={activeUnitsHere}
              smartSuggestions={[]}
                  selectedStation={selectedStation}
                  onProcessUnit={handleProcessUnit}
                  
                  onClickUnit={handleActiveUnitClick}
                />
              )
            )}
            {activeTab === "lossen" && (
              <div className="h-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                {isWorkstationGereedTab ? (
                  <GereedView
                  products={visibleRawProducts}
                    stationId={selectedStation}
                  />
                ) : ((selectedStation || "").toUpperCase().replace(/\s/g, "").includes("NABEWERK")) ? (
              <Nabewerken products={visibleRawProducts} orders={rawOrders} />
                ) : (String(selectedStation || "").toUpperCase().replace(/\s/g, "") === "MAZAK") ? (
                  <MazakView
                  products={visibleRawProducts}
                    stationId={selectedStation}
                  />
                ) : (
                <LossenView
                products={visibleRawProducts}
                    stationId={selectedStation}
                    appId={currentAppId}
                  />
                )}
              </div>
            )}
            {activeTab === "terminal" && (
              <div className="h-full">
                {isBM01 ? (
                  <BM01Hub 
                    onBack={handleBack} 
                  orders={rawOrders}
                  products={rawProducts}
                    onMoveLot={handleMoveLot}
                  />
                ) : (
              <Terminal
                    initialStation={selectedStation}
                    orders={isLossen1218Station ? rawOrders : stationOrders}
                    onCancelProduction={handleCancelProduction}
                  />
                )}
              </div>
            )}
          </>
        )}
      </div>

      <WorkstationModals
        stationId={selectedStation}
                  rawProducts={visibleRawProducts}
        handleStartProduction={handleStartProduction}
        handleOpenProductInfo={handleOpenProductInfo}
        handleLinkProduct={handleLinkProduct}
        handlePostProcessingFinish={handlePostProcessingFinish}
        handleRepairComplete={handleRepairComplete}
        handleOperatorShiftCheckin={handleOperatorShiftCheckin}
        handleOperatorCheckout={handleOperatorCheckout}
        handleSaveHourCorrection={handleSaveHourCorrection}
        onDismissPromptShift={() => setDismissedPromptShift(currentShiftKey)}
        stationOccupancy={stationOccupancy}
        currentShiftKey={currentShiftKey}
        nfc={nfc}
        SHIFT_CONFIG={SHIFT_CONFIG}
        getShiftColor={getShiftColor}
        toFiniteNumber={toFiniteNumber}
        currentUser={currentUser}
        isPostProcessing={isPostProcessing}
        isBM01={isBM01}
      />
    </div>
    </>
  );
}
export default WorkstationHub;
