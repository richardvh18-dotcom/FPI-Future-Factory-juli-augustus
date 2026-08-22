
import { collection, collectionGroup, query, onSnapshot, doc, serverTimestamp, where, limit, getDocs, getDoc, arrayUnion, increment, addDoc, updateDoc } from "firebase/firestore";
import React, { useState, useEffect, useMemo, useRef, useCallback, useDeferredValue } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { LogOut, Loader2, Menu, X, Clock, Calendar, UserCheck, AlertTriangle } from "lucide-react";
import { useNFCReader, NFC_STATUS } from "../useNFCReader";
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
import { useAdminAuth } from "../useAdminAuth";
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
import { subscribeTrackedProducts } from "../../utils/trackedProducts";
import { useWorkstationStore } from "../../components/digitalplanning/useWorkstationStore";
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
} from "../../components/digitalplanning/WorkstationTypes";


const WORKSTATION_SCOPED_ORDERS_LIMIT = 800;


export const useWorkstationActions = (state: any) => {
    const { currentUserId, navigate, initialStationName, selectedStation, setSelectedStation, activeTab, setActiveTab, rawOrders, setRawOrders, rawProducts, setRawProducts, occupancy, setOccupancy, personnel, setPersonnel, loading, setLoading, dataSourceRefreshKey, setDataSourceRefreshKey, archivedStats, setArchivedStats, backgroundTrackingUnsubRef, backgroundTrackingTimerRef, visibleRawProducts, currentDate, currentWeekInfo, isMobileMenuOpen, setIsMobileMenuOpen, checkedInOperator, setCheckedInOperator, dismissedPromptShift, setDismissedPromptShift, timeHeartbeat, setTimeHeartbeat, activeDowntime, setActiveDowntime, lastShiftRef, nfcPendingBadgeRef, handleOperatorShiftCheckinRef, nfc, lastAutoCheckoutMinuteRef, lastAppliedInitialStationRef, currentAppId, isPostProcessing, isBM01, isLossen1218Station, requiresShiftCheckin, currentShiftKey, isPWA, getShiftColor, isShiftActive, stationOccupancy, currentOperatorIndex, setCurrentOperatorIndex, stationActivityByOrder, stationOrders, stationStats, activeUnitsHere, selectedStationNormForHeader, selectedStationCleanForHeader, isBm01HeaderStation, isWorkstationGereedTab, isTwoKpiHeaderStation, todoHeaderLabel, pullStartY, setPullStartY, pullDistance, setPullDistance, isRefreshing, setIsRefreshing, contentRef, t, currentUser, showSuccess, showError, showInfo, showWarning, requestBrowserPermission, showConfirm, notify, WORKSTATIONS } = state;
    
    const handleOperatorCheckout = async (occ: OccupancyEntry) => {
    if (!occ || !occ.id) return;
    
    const confirmMessage = t("digitalplanning.workstation.confirm_checkout_msg", { name: occ.operatorName, station: occ.machineId || selectedStation });
    const confirmed = await showConfirm({
      title: t("digitalplanning.workstation.confirm_checkout", "Uitloggen bevestigen"),
      message: confirmMessage || `Weet je zeker dat je ${occ.operatorName} wilt uitloggen van ${occ.machineId || selectedStation}?`,
      confirmText: t("digitalplanning.workstation.logout", "Uitloggen"),
      cancelText: t("common.cancel", "Annuleren"),
      tone: "danger",
    });

    if (!confirmed) return;

    try {
      const now = new Date();
      const previousHours = Number(occ.hoursWorked || 0);
      const checkedInDate = toDateSafe(occ.shiftEffectiveStart) || toDateSafe(occ.checkedInAt);
      const elapsedHours = checkedInDate ? Math.max(0, (now.getTime() - checkedInDate.getTime()) / 3600000) : 0;
      
      const breakHours = (SHIFT_CONFIG[occ.shiftKey as ShiftKey]?.breakMinutes ?? 0) / 60;
      const grossHours = Number((previousHours + elapsedHours).toFixed(2));
      const finalHours = occ.isSecondary
        ? 0
        : Math.max(0, Number((grossHours - breakHours).toFixed(2)));

      await saveOccupancyAssignment({
        assignmentId: occ.id,
        data: {
          hoursWorked: finalHours,
          hoursWorkedGross: occ.isSecondary ? 0 : grossHours,
          ...(breakHours > 0 && !occ.isSecondary ? { breakDeductedHours: breakHours } : {}),
          checkedOutAt: "__SERVER_TIMESTAMP__",
          isActive: false,
          updatedAt: "__SERVER_TIMESTAMP__",
        },
        source: "WorkstationHub.manualCheckout",
        actorLabel: currentUser?.email || "Operator",
      });

      await logWorkstationActivity(
        "OPERATOR_CHECKOUT",
        `Handmatige uitlog: ${occ.operatorName} op ${occ.machineId || selectedStation}`,
        { personnelNumber: occ.operatorNumber }
      );

      showSuccess(`${occ.operatorName} is uitgelogd.`);
    } catch (err) {
      console.error("Manual checkout failed:", err);
      showError("Uitloggen mislukt: " + (err instanceof Error ? err.message : String(err)));
    }
  };

    const toggleMachineStoring = async () => {
    if (activeDowntime) {
      const confirmed = await showConfirm({
        title: "Storing verholpen?",
        message: "Is de machine storing verholpen en kan de productie weer starten?",
        confirmText: "Ja, verholpen",
        cancelText: "Annuleren",
        tone: "default",
      });
      if (confirmed) {
        try {
          await logWorkstationActivity("MACHINE_UP", `Storing op ${selectedStation} verholpen.`);
          await updateDoc(doc(db, getPathString(PATHS.DOWNTIME), activeDowntime.id), {
            endTime: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          showSuccess("Storing succesvol afgemeld.");
        } catch (e) {
          console.error("Machine Storing Update Error:", e);
          showError("Kon storing niet afmelden. " + String(e));
        }
      }
    } else {
      const confirmed = await showConfirm({
        title: "Machine in storing?",
        message: "Wil je deze machine in storing melden? Productie kan niet gestart worden zolang de storing actief is.",
        confirmText: "Ja, in storing zetten",
        cancelText: "Annuleren",
        tone: "danger",
      });
      if (confirmed) {
        try {
          await logWorkstationActivity("MACHINE_DOWN", `Machine ${selectedStation} in storing gemeld.`);
          await addDoc(collection(db, getPathString(PATHS.DOWNTIME)), {
            machineId: selectedStation,
            startTime: serverTimestamp(),
            endTime: null,
            reportedBy: checkedInOperator?.name || currentUser?.email || "Onbekend",
            status: "STORING",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          showWarning("Machine staat nu in storing!");
        } catch (e) {
          console.error("Machine Storing Add Error:", e);
          showError("Kon storing niet aanmelden. " + String(e));
        }
      }
    }
  };

    const logWorkstationActivity = async (action: string, details: string, options: { personnelNumber?: string } = {}) => {
    const baseDetails = String(details || "");
    const resolvedPersonnelNumber = String(
      options?.personnelNumber || checkedInOperator?.number || ""
    ).trim();

    const hasPersonnelNumberAlready = /personeelsnummer\s*:/i.test(baseDetails);
    const enrichedDetails =
      resolvedPersonnelNumber && !hasPersonnelNumberAlready
        ? `${baseDetails} | Personeelsnummer: ${resolvedPersonnelNumber}`
        : baseDetails;

    await logActivity(currentUser?.uid || "system", action, enrichedDetails);
  };

    const requestNotificationPermission = async () => {
    await requestBrowserPermission();
  };

    const showInstallInstructions = () => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      showInfo("1. Tik op de 'Deel' knop (vierkant met pijl omhoog)\n2. Scroll omlaag en kies 'Zet op beginscherm'", "Installeren op iPad");
    } else {
      showInfo("Gebruik het menu van je browser om de app te installeren via 'Toevoegen aan startscherm'.", "App installeren");
    }
  };

    const handleOperatorShiftCheckin = async (badgeOverride?: unknown) => {
    const resolveBadgeInput = (input: unknown) => {
      if (typeof input === "string" || typeof input === "number") return String(input).trim();
      if (input && typeof input === "object") {
        // React/DOM events, NFC payloads of object-structuren kunnen hier terechtkomen.
        const eventValue = (input as { target?: { value?: unknown }; currentTarget?: { value?: unknown } })?.target?.value ?? (input as { target?: { value?: unknown }; currentTarget?: { value?: unknown } })?.currentTarget?.value;
        if (eventValue !== undefined && eventValue !== null) return String(eventValue).trim();
        const objectBadge = (input as { employeeNumber?: unknown; badge?: unknown; uid?: unknown })?.employeeNumber ?? (input as { employeeNumber?: unknown; badge?: unknown; uid?: unknown })?.badge ?? (input as { employeeNumber?: unknown; badge?: unknown; uid?: unknown })?.uid;
        if (objectBadge !== undefined && objectBadge !== null) return String(objectBadge).trim();
      }
      return "";
    };

    const rawBadge = resolveBadgeInput(badgeOverride) || String(useWorkstationStore.getState().operatorBadgeInput || "").trim();
    if (!rawBadge) {
      showWarning("Scan of vul eerst een personeelsnummer in.", "Personeel");
      return;
    }
    // Registreer deze functie zodat de NFC hook hem kan aanroepen
    // handleOperatorShiftCheckinRef.current = handleOperatorShiftCheckin;

    useWorkstationStore.getState().setIsCheckingInOperator(true);
    try {
      const normalizedBadge = rawBadge.toUpperCase();
      const normalizedAlphaNumericBadge = rawBadge.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const numericBadge = rawBadge.replace(/\D/g, "");
      const normalizedNumericBadge = numericBadge.replace(/^0+/, "");
      const sameBadgeValue = (value: unknown) => {
        const candidate = String(value || "").trim();
        if (!candidate) return false;
        if (candidate.toUpperCase() === normalizedBadge) return true;
        const candidateAlphaNumeric = candidate.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
        if (candidateAlphaNumeric && candidateAlphaNumeric === normalizedAlphaNumericBadge) return true;
        const candidateDigits = candidate.replace(/\D/g, "");
        if (!candidateDigits) return false;
        return candidateDigits.replace(/^0+/, "") === normalizedNumericBadge;
      };

      let person: PersonnelEntry | null = personnel.find((p: PersonnelEntry) => {
        const id = String(p.id || "").trim();
        const empNo = String(p.employeeNumber || "").trim();
        return sameBadgeValue(id) || sameBadgeValue(empNo);
      }) || null;

      if (!person) {
        const employeeCandidates = Array.from(new Set([
          rawBadge,
          normalizedBadge,
          numericBadge,
          normalizedNumericBadge,
        ].filter(Boolean)));

        for (const candidate of employeeCandidates) {
          const byEmployeeSnap = await getDocs(
            query(collection(db, getPathString(PATHS.PERSONNEL)), where("employeeNumber", "==", candidate), limit(1))
          );
          if (!byEmployeeSnap.empty) {
            const d = byEmployeeSnap.docs[0];
            person = { id: d.id, ...(d.data() as Omit<PersonnelEntry, "id">) };
            break;
          }

          const numericCandidate = Number(candidate);
          if (Number.isFinite(numericCandidate) && candidate !== String(numericCandidate)) {
            const byEmployeeNumericSnap = await getDocs(
              query(collection(db, getPathString(PATHS.PERSONNEL)), where("employeeNumber", "==", numericCandidate), limit(1))
            );
            if (!byEmployeeNumericSnap.empty) {
              const d = byEmployeeNumericSnap.docs[0];
              person = { id: d.id, ...(d.data() as Omit<PersonnelEntry, "id">) };
              break;
            }
          }
        }
      }

      // Probeer als NFC tag UID (gekoppeld via admin registratie)
      if (!person) {
        const mappingDocCandidates = Array.from(new Set([
          rawBadge,
          normalizedBadge,
          normalizedAlphaNumericBadge,
          rawBadge.replace(/\s+/g, "").toUpperCase(),
        ].filter(Boolean)));

        for (const mappingDocId of mappingDocCandidates) {
          const tagMapSnap = await getDoc(doc(db, `${getPathString(PATHS.NFC_TAG_MAPPINGS)}/${mappingDocId}`));
          if (tagMapSnap.exists()) {
            const mapping = tagMapSnap.data();
            const empNum = mapping.employeeNumber;
            const personSnap = await getDocs(
              query(collection(db, getPathString(PATHS.PERSONNEL)), where("employeeNumber", "==", empNum), limit(1))
            );
            if (!personSnap.empty) {
              person = { id: personSnap.docs[0].id, ...(personSnap.docs[0].data() as Omit<PersonnelEntry, "id">) };
              break;
            }
          }
        }
      }

      if (!person) {
        const docIdCandidates = Array.from(new Set([
          rawBadge,
          normalizedBadge,
          `P_${rawBadge}`,
          `P_${normalizedBadge}`,
          numericBadge ? `P_${numericBadge}` : "",
          normalizedNumericBadge ? `P_${normalizedNumericBadge}` : "",
        ].filter(Boolean)));

        for (const docIdCandidate of docIdCandidates) {
          const personDoc = await getDoc(doc(db, `${getPathString(PATHS.PERSONNEL)}/${docIdCandidate}`));
          if (personDoc.exists()) {
            person = { id: personDoc.id, ...(personDoc.data() as Omit<PersonnelEntry, "id">) };
            break;
          }
        }
      }

      if (!person) {
        showError(`Personeelsnummer ${rawBadge} niet gevonden in Personeel.`);
        return;
      }

      const now = new Date();
      const todayStr = getTodayString();
      const extractDigits = (value: unknown) => String(value || "").replace(/\D/g, "").replace(/^0+/, "");
      const personIdDigits = extractDigits(person.id);
      const badgeDigits = extractDigits(rawBadge);
      const operatorNumber = String(
        person.employeeNumber ||
        personIdDigits ||
        badgeDigits ||
        person.id ||
        rawBadge
      );

      const resolveOperatorName = (personRecord: PersonnelEntry, fallbackNumber: string) => {
        const directName =
          personRecord?.name ||
          personRecord?.displayName ||
          personRecord?.fullName ||
          personRecord?.operatorName ||
          [personRecord?.firstName, personRecord?.lastName].filter(Boolean).join(" ") ||
          [personRecord?.voornaam, personRecord?.achternaam].filter(Boolean).join(" ");

        if (String(directName || "").trim()) return String(directName).trim();

        const enriched = personnel.find((p: any) => {
          const id = String(p.id || "").trim();
          const empNo = String(p.employeeNumber || "").trim();
          if (sameBadgeValue(id) || sameBadgeValue(empNo)) return true;
          const pDigits = extractDigits(p.employeeNumber || p.id);
          const opDigits = extractDigits(fallbackNumber);
          return Boolean(pDigits && opDigits && pDigits === opDigits);
        });

        const enrichedName =
          enriched?.name ||
          enriched?.displayName ||
          enriched?.fullName ||
          enriched?.operatorName ||
          [enriched?.firstName, enriched?.lastName].filter(Boolean).join(" ") ||
          [enriched?.voornaam, enriched?.achternaam].filter(Boolean).join(" ");

        if (String(enrichedName || "").trim()) return String(enrichedName).trim();
        return `Operator ${fallbackNumber}`;
      };

      const resolvedOperatorName = resolveOperatorName(person, operatorNumber);

      const occSnap = await getDocs(
        query(collection(db, getPathString(PATHS.OCCUPANCY)), where("date", "==", todayStr), limit(300))
      );

      const activeEntries: OccupancyEntry[] = occSnap.docs
        .map((d): OccupancyEntry => ({ id: d.id, ...(d.data() as Omit<OccupancyEntry, "id">) }))
        .filter((entry) => {
          const sameOperator = String(entry.operatorNumber || "").toUpperCase() === operatorNumber.toUpperCase();
          const isActive = entry.isActive !== false && !entry.checkedOutAt;
          return sameOperator && isActive;
        });

      const currentMachineNormalized = String(normalizeMachine(selectedStation) || selectedStation || "").toUpperCase();
      const atpsPresenceMachine = "ATPS_AANWEZIGHEID";
      const otherActiveStations = Array.from(new Set(
        activeEntries
          .map((entry) => String(entry.machineId || "").trim())
          .filter(Boolean)
          .filter((machineId) => machineId.toUpperCase() !== atpsPresenceMachine)
          .filter((machineId) => String(normalizeMachine(machineId) || machineId).toUpperCase() !== currentMachineNormalized)
      ));

      const confirmMessage = otherActiveStations.length > 0
        ? `${resolvedOperatorName} inloggen op ${selectedStation}?\n\nDeze medewerker is nu nog ingelogd op: ${otherActiveStations.join(", ")}\nBij doorgaan wordt daar automatisch uitgelogd.`
        : `${resolvedOperatorName} inloggen op ${selectedStation}?`;

      const confirmedCheckin = await showConfirm({
        title: "Operator inloggen",
        message: confirmMessage,
        confirmText: "Inloggen",
        cancelText: "Annuleren",
        tone: "default",
      });

      if (!confirmedCheckin) {
        return;
      }

      if (activeEntries.length > 0) {
        await saveOccupancyAssignments({
          records: activeEntries.map((entry) => {
            const previousHours = Number(entry.hoursWorked || 0);
            const checkedInDate = toDateSafe(entry.shiftEffectiveStart) || toDateSafe(entry.checkedInAt);
            const elapsedHours = checkedInDate ? Math.max(0, (now.getTime() - checkedInDate.getTime()) / 3600000) : 0;
            const finalHours = entry.isSecondary ? 0 : Number((previousHours + elapsedHours).toFixed(2));
            return {
              assignmentId: entry.id,
              data: {
                hoursWorked: finalHours,
                checkedOutAt: "__SERVER_TIMESTAMP__",
                isActive: false,
                movedToMachineId: selectedStation,
                updatedAt: "__SERVER_TIMESTAMP__",
              },
            };
          }),
          source: "WorkstationHub.operatorCheckin.closePrevious",
          actorLabel: currentUser?.email || "Operator",
        });
      }

      // Bepaal dienst o.b.v. personeelsbestand (person.shiftId), kloktijd als fallback.
      const personShiftKey = resolveShiftKeyFromPerson(person);
      const personShiftLabel = SHIFT_CONFIG[personShiftKey]?.label ?? getCurrentShiftLabel();
      // Timer begint altijd op het officiële starttijdstip van de ploeg (geen vroeg/laat afronden)
      const shiftEffectiveStartDate = getShiftEffectiveStart(personShiftKey, now);
      const shiftEffectiveStartISO = shiftEffectiveStartDate.toISOString();

      const machineNorm = (normalizeMachine(selectedStation) || selectedStation || "").replace(/[^a-zA-Z0-9]/g, "_");
      const occId = `${todayStr}_${machineNorm}_${operatorNumber}_${Date.now()}`;

      await saveOccupancyAssignment({
        assignmentId: occId,
        data: {
        departmentId: person.departmentId || "fittings",
        machineId: selectedStation,
        operatorNumber,
        operatorName: resolvedOperatorName,
        date: todayStr,
        hoursWorked: 0,
        isPloeg: false,
        shift: personShiftLabel,
        shiftKey: personShiftKey,
        shiftEffectiveStart: shiftEffectiveStartISO,
        isLoan: false,
        checkedOutAt: null,
        isActive: true,
        source: "workstation_checkin",
        checkedInAt: "__SERVER_TIMESTAMP__",
        updatedAt: "__SERVER_TIMESTAMP__",
        // ATPS-koppeling voorbereiding:
        // atpsExported: false — wordt true zodra ATPS-export gerund wordt
        // hoursAdjusted: false — wordt true na teamleider uren-correctie
        // hoursAdjustedAt / hoursAdjustedBy worden ingevuld bij correctie
        atpsExported: false,
        hoursAdjusted: false,
        hoursAdjustedAt: null,
        hoursAdjustedBy: null,
        hoursCorrectionReason: null,

      },
        source: "WorkstationHub.operatorCheckin.primary",
        actorLabel: currentUser?.email || "Operator",
      });

      await logWorkstationActivity(
        "OPERATOR_CHECKIN",
        `Operator check-in: ${operatorNumber} op ${selectedStation}; eerdere actieve inschrijvingen gesloten: ${activeEntries.length}`,
        { personnelNumber: operatorNumber }
      );

      if (person.id) {
        await savePersonnelRecord({
          personId: person.id,
          data: {
            currentMachineId: selectedStation,
            lastBadgeScanAt: "__SERVER_TIMESTAMP__",
            lastBadgeScanBy: currentUser?.uid || undefined,
          },
          source: "WorkstationHub.operatorCheckin.personnel",
          actorLabel: currentUser?.email || "Operator",
        }).catch(() => {});
      }

      setCheckedInOperator({
        number: operatorNumber,
        name: resolvedOperatorName,
        machineId: selectedStation,
      });
      useWorkstationStore.getState().setOperatorBadgeInput("");

      if (activeEntries.length > 0) {
        if (otherActiveStations.length > 0) {
          showSuccess(`${resolvedOperatorName} ingelogd op ${selectedStation}. Automatisch uitgelogd op: ${otherActiveStations.join(", ")}.`);
        } else {
          showSuccess(`${resolvedOperatorName} overgezet naar ${selectedStation}.`);
        }
      } else {
        showSuccess(`${resolvedOperatorName} aangemeld op ${selectedStation}.`);
      }

      // Auto-login bij LOSSEN 12/18 voor BH12/BH15/BH17/BH18
      const selectedStationNormForAutoLogin = normalizeMachine(selectedStation).toUpperCase().replace(/\s/g, "");
      if (AUTO_LOSSEN_1218_SOURCE_STATIONS.has(selectedStationNormForAutoLogin)) {
        try {
          // Controleer of operator vandaag al een actief secondary-record heeft bij LOSSEN 12/18
          const lossen1218OccSnap = await getDocs(
            query(collection(db, getPathString(PATHS.OCCUPANCY)), where("date", "==", todayStr), limit(300))
          );
          const alreadyAtLossen1218 = lossen1218OccSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<OccupancyEntry, "id">) }))
            .some((e: OccupancyEntry) => {
              const eMachineNorm = normalizeMachine(e.machineId || "").toUpperCase().replace(/\s/g, "");
              const sameOp = String(e.operatorNumber || "").toUpperCase() === operatorNumber.toUpperCase();
              const isAtLossen1218 = eMachineNorm === "LOSSEN12/18";
              const isActive = e.isActive !== false && !e.checkedOutAt;
              return sameOp && isAtLossen1218 && isActive;
            });

          if (!alreadyAtLossen1218) {
            const lossen1218Norm = (normalizeMachine(LOSSEN_1218_STATION_NAME) || LOSSEN_1218_STATION_NAME).replace(/[^a-zA-Z0-9]/g, "_");
            const lossen1218OccId = `${todayStr}_${lossen1218Norm}_${operatorNumber}_auto_${Date.now()}`;
            await saveOccupancyAssignment({
              assignmentId: lossen1218OccId,
              data: {
              departmentId: person.departmentId || "fittings",
              machineId: LOSSEN_1218_STATION_NAME,
              operatorNumber,
              operatorName: resolvedOperatorName,
              date: todayStr,
              hoursWorked: 0,
              isPloeg: false,
              shift: personShiftLabel,
              shiftKey: personShiftKey,
              isLoan: false,
              isSecondary: true,        // Uren niet dubbeltellen
              primaryStation: selectedStation,
              checkedOutAt: null,
              isActive: true,
              source: "auto_lossen1218",
              checkedInAt: "__SERVER_TIMESTAMP__",
              updatedAt: "__SERVER_TIMESTAMP__",
            },
              source: "WorkstationHub.operatorCheckin.secondaryLossen1218",
              actorLabel: currentUser?.email || "Operator",
            });
          }
        } catch (err) {
          console.warn("Auto-login LOSSEN 12/18 mislukt (niet kritiek):", err);
        }
      }

      showInfo("Je kunt direct nog een operator scannen.");
    } catch (err) {
      console.error("Operator check-in fout:", err);
      showError(`Aanmelden op station mislukt: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      useWorkstationStore.getState().setIsCheckingInOperator(false);
    }
  };

    const handleSaveHourCorrection = async () => {
    const store = useWorkstationStore.getState();
    if (!store.hourCorrectionEntry) return;
    const newHours = parseFloat(String(store.correctedHours).replace(",", "."));
    if (isNaN(newHours) || newHours < 0) {
      showWarning("Vul een geldig aantal uren in (bijv. 6 of 6.5).");
      return;
    }
    store.setIsSavingCorrection(true);
    try {
      await saveOccupancyAssignment({
        assignmentId: store.hourCorrectionEntry.id,
        data: {
          hoursWorked: newHours,
          hoursAdjusted: true,
          hoursAdjustedAt: "__SERVER_TIMESTAMP__",
          hoursAdjustedBy: currentUser?.email || currentUser?.uid || "teamleader",
          hoursCorrectionReason: store.correctionReason.trim() || undefined,
          atpsExported: false, // markeer als nog niet geëxporteerd naar ATPS
          updatedAt: "__SERVER_TIMESTAMP__",
        },
        source: "WorkstationHub.hourCorrection",
        actorLabel: currentUser?.email || "Teamleider",
      });
      await logWorkstationActivity(
        "HOURS_CORRECTED",
        `Uren gecorrigeerd: ${store.hourCorrectionEntry.operatorName} op ${store.hourCorrectionEntry.machineId} → ${newHours}u (was ${store.hourCorrectionEntry.hoursWorked}u). Reden: ${store.correctionReason || "–"}`
      );
      showSuccess(`Uren bijgewerkt: ${store.hourCorrectionEntry.operatorName} → ${newHours} uur`);
      store.setShowHourCorrectionModal(false);
      store.setHourCorrectionEntry(null);
      store.setCorrectedHours("");
      store.setCorrectionReason("");
    } catch (err) {
      console.error("Uren correctie fout:", err);
      showError(`Opslaan mislukt: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      store.setIsSavingCorrection(false);
    }
  };

    const handleBack = () => {
    if (state.onExit) {
      state.onExit();
    } else {
      navigate("/portal");
    }
  };

    const handleStartProduction = async (
    order: PlanningOrder,
    customLotNumber: string,
    stringCount = 1,
    _manualOrderInput?: string,
    _operatorInput?: string,
    _selectedOperatorName?: string,
    labelZplData?: string,
    labelTemplateId?: string,
    startOptions: StartProductionOptions = {}
  ) => {
    if (!currentUser || !customLotNumber) return;
    
    if (activeDowntime) {
      showError("Machine staat momenteel in storing! Meld de storing eerst af via de knop bovenaan om productie te starten.");
      useWorkstationStore.getState().setShowStartModal(false);
      return;
    }

    const previousTab = activeTab;

    // Snellere UX: direct modal sluiten en naar Wikkelen schakelen,
    // terwijl de backend startflow op de achtergrond afrondt.
    useWorkstationStore.getState().setShowStartModal(false);
    if (!isPostProcessing && !isBM01) {
      setActiveTab("winding");
    }

    try {
      const explicitLotNumbers = Array.isArray(startOptions?.lotNumbers)
        ? startOptions.lotNumbers.map((entry: unknown) => String(entry || "").trim().toUpperCase()).filter(Boolean)
        : [];
      const batchCount = explicitLotNumbers.length > 0 ? explicitLotNumbers.length : Math.max(1, parseInt(String(stringCount), 10) || 1);
      const seriesGroupId = String(startOptions?.seriesGroupId || "").trim() || undefined;
      let overflowItems: string[] = [];

      const stationOperators = occupancy
        .filter((occ: any) => {
          if (occ.station !== selectedStation) return false;
          if (!occ.date) return false;
          const occDate = toDateSafe(occ.date) || new Date();
          occDate.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
        })
        .map((occ: any) => occ.operatorNumber)
        .filter(Boolean);

      const startResult = (await startWorkstationProductionRun({
        orderDocId: String(order.id || ""),
        lotStart: customLotNumber,
        stringCount: batchCount,
        stationId: String(selectedStation || ""), // TS Fix
        orderDocPath: String((order as any)?.__docPath || ""),
        orderSourcePath: String((order as any)?.sourcePath || ""),
        actorLabel: currentUser?.email || "Operator",
        labelZplData: typeof labelZplData === "string" ? labelZplData : "",
        labelTemplateId: String(labelTemplateId || ""), // TS Fix
        seriesGroupId: String(seriesGroupId || ""), // TS Fix
        isFlangeSeries: !!startOptions?.isFlangeSeries,
        lotNumbers: explicitLotNumbers,
        stationOperators: stationOperators.filter(Boolean) as string[] as string[],
        source: "WorkstationHub",
      })) as StartProductionResult;

      overflowItems = Array.isArray(startResult?.overflowLots) ? startResult.overflowLots : [];
      const autoAssignedOverflow = startResult?.autoAssignedOverflow || undefined;

      const linkedCount = autoAssignedOverflow?.linkedCount ?? 0;
      if (linkedCount > 0 && autoAssignedOverflow?.targetOrderId) {
        showSuccess(
          `${autoAssignedOverflow.linkedCount} extra stuk(s) automatisch gekoppeld aan order ${autoAssignedOverflow.targetOrderId}${autoAssignedOverflow.routeStation ? ` en doorgestuurd naar ${autoAssignedOverflow.routeStation}` : ""}.`
        );
      }

      if (overflowItems.length > 0) {
        await createProductionMessages({
          messages: [{
            from: "SYSTEM",
            senderId: currentUser?.uid || "system-auto",
            subject: `Overproductie op ${selectedStation}`,
            content: `${overflowItems.length} extra producten zijn aangemaakt vanuit order ${order.orderId}. Koppel deze aan een nieuw LN-ordernummer zodra beschikbaar. Lotnummers: ${overflowItems.join(", ")}`,
            title: `Overproductie op ${selectedStation}`,
            message: `${overflowItems.length} extra producten vanuit order ${order.orderId}. Lots: ${overflowItems.join(", ")}`,
            priority: "high",
            type: "warning",
            source: "WorkstationHub",
            targetRoles: ["planner", "admin"],
            targetGroup: "PLANNERS_AND_ADMINS",
            broadcastToAll: true,
            metadata: {
              kind: "overproduction",
              originalOrderId: order.orderId,
              originStation: selectedStation,
              lotNumbers: overflowItems,
              count: overflowItems.length,
            },
          }],
          source: "WorkstationHub",
          actorLabel: currentUser?.email || "Operator",
        });

        notify(
          `Let op: Er zijn ${overflowItems.length} producten meer gemaakt dan gepland.`
        );
      }

      await logWorkstationActivity(
        "ORDER_RELEASE",
        `Workstation start: order ${order.orderId}, station ${selectedStation}, lot start ${customLotNumber}, count ${stringCount}, overflow ${overflowItems.length}`
      );
    } catch (error) {
      console.error(error);
      if (!isPostProcessing && !isBM01) {
        setActiveTab(previousTab || "terminal");
      }
      throw error;
    }
  };

    const handleMoveLot = async (lotNumber: string, newStation: string, options: MoveLotOptions = {}) => {
    if (!lotNumber || !newStation) return;
    try {
      const isRepairMove = Boolean(options?.isRepairMove);
      const repairInstruction = String(options?.repairInstruction || "").trim();

      await moveTrackedProductManual({
        productOrLotId: lotNumber,
        newStation,
        isRepairMove,
        repairInstruction,
        source: "WorkstationHub",
        actorLabel: currentUser?.email || "Operator",
      });

      await logWorkstationActivity(
        "LOT_MANUAL_MOVE",
        `${isRepairMove ? "Workstation reparatie" : "Workstation move"}: lot ${lotNumber} -> ${newStation}${repairInstruction ? ` | instructie: ${repairInstruction}` : ""}`
      );
      showSuccess(`${isRepairMove ? "Reparatie" : "Product"} ${lotNumber} verplaatst naar ${newStation}`);
    } catch (err: unknown) {
      console.error("Fout bij verplaatsen:", err);
      showError("Fout bij verplaatsen: " + (err instanceof Error ? err.message : String(err)));
    }
  };

    const handlePauseResume = async (product: TrackedProductDoc) => {
    if (!product) return;
    try {
      const isPaused = product.status === "PAUSED";

      await toggleTrackedProductPause({
        productId: (product.id || product.lotNumber) as string,
        actorLabel: currentUser?.email || "Operator",
        source: "WorkstationHub",
      });
      await logWorkstationActivity(
        isPaused ? "PRODUCTION_RESUME" : "PRODUCTION_PAUSE",
        `Workstation ${isPaused ? "resume" : "pause"}: lot ${product.lotNumber || product.id} op ${selectedStation}`
      );
      
      if (isPaused) showSuccess("Productie hervat");
      else showInfo("Productie gepauzeerd");
    } catch (err) {
      console.error("Fout bij pauzeren:", err);
      showError("Kon status niet wijzigen");
    }
  };

    const handleLinkProduct = async (docId: string, product: TrackedProductDoc) => {
    try {
      await linkPlanningOrderProduct({
        orderDocId: docId,
        productId: product.id as string,
        productImage: String(product.imageUrl || ""),
      });
      await logWorkstationActivity(
        "ORDER_LINK_PRODUCT",
        `Order gelinkt: planning ${docId} -> product ${product?.id}`
      );
      showSuccess("Product succesvol gekoppeld!");
      useWorkstationStore.getState().setShowLinkModal(false);
      useWorkstationStore.getState().setOrderToLink(null);
    } catch (error) {
      console.error(error);
      showError("Kon product niet koppelen", "Koppelen mislukt");
    }
  };

    const handlePostProcessingFinish = async (status: string, data: PostProcessingPayload) => {
    const itemToFinish = useWorkstationStore.getState().itemToFinish;
    if (!itemToFinish) return;
    const productId = itemToFinish.id || itemToFinish.lotNumber;
    try {
      if (status === "completed") {
        const normalizedStation = String(selectedStation || "").toUpperCase().replace(/\s+/g, "");
        const isBM01 = normalizedStation === "BM01" || normalizedStation === "STATIONBM01" || normalizedStation.includes("BM01");
        const isNaharding = normalizedStation.includes("OVEN") || normalizedStation.includes("NAHARD");
        const finishType = isBM01 ? "post_inspection" : (isNaharding ? "archive" : "forward");
        await completeTrackedProduct({
          productId,
          finishType,
          fromStation: selectedStation,
          note: data.note || "",
          actorLabel: currentUser?.email || undefined,
          source: "WorkstationHub",
        });
        useWorkstationStore.getState().setFinishModalOpen(false);
        useWorkstationStore.getState().setItemToFinish(null);
        return;
      }

      if (status === "rejected") {
        await rejectTrackedProductFinal({
          productId,
          reasons: data.reasons || [],
          note: data.note || "",
          source: "WorkstationHub",
          actorLabel: currentUser?.email || undefined,
        });
        useWorkstationStore.getState().setFinishModalOpen(false);
        useWorkstationStore.getState().setItemToFinish(null);
        return;
      }

      await tempRejectTrackedProduct({
        productId,
        reasons: data.reasons || [],
        note: data.note || "",
        station: selectedStation,
        actorLabel: currentUser?.email || "Operator",
        previousStep: itemToFinish.currentStep,
        previousStatus: itemToFinish.status,
        source: "WorkstationHub",
      });
      await logWorkstationActivity(
        "QUALITY_TEMP_REJECT",
        `Post-processing: lot ${itemToFinish?.lotNumber || itemToFinish?.id}, station ${selectedStation}, status temp_reject`
      );
      useWorkstationStore.getState().setFinishModalOpen(false);
      useWorkstationStore.getState().setItemToFinish(null);
    } catch (error) {
      console.error("Fout bij afronden:", error);
      showError("Kon wijzigingen niet opslaan", "Fout bij opslaan");
    }
  };

    const handleProcessUnit = async (product: TrackedProductDoc, options: { bulkUnits?: TrackedProductDoc[] } = {}) => {
    const stationCheck = String(selectedStation).toLowerCase();

    // NIEUW: BH31 Reparatie flow
    if (stationCheck === "bh31") {
        useWorkstationStore.getState().setItemToRepair(product);
        useWorkstationStore.getState().setShowRepairModal(true);
        return;
    }

    if (
      stationCheck === "nabewerking" ||
      stationCheck === "mazak" ||
      stationCheck === "bm01" ||
      selectedStation === "Station BM01"
    ) {
      useWorkstationStore.getState().setItemToFinish(product);
      useWorkstationStore.getState().setFinishModalOpen(true);
      return;
    }

    // FIX: Handmatige verplaatsing door Teamleader
    // Bepaal dynamisch de juiste stap op basis van het nieuwe station
    if (product.isManualMove) {
      try {
        const targetStation = product.currentStation || selectedStation;
        const targetProductId = product.id || product.lotNumber;

        await advanceTrackedProduct({
          productId: targetProductId as string,
          nextStation: "",
          nextStep: String(product.currentStep || "").trim() || "Wikkelen",
          nextStatus: String(product.status || "").trim() || "In Production",
          lastStation: targetStation,
          note: product.note ? product.note + ` (Hervat op ${targetStation})` : `Hervat op ${targetStation}`,
          actorLabel: currentUser?.email || "Operator",
          previousStep: product.currentStep || "",
          historyAction: "Handmatige Verplaatsing Hervat",
          historyDetails: `Handmatige verplaatsing hervat op ${targetStation}`,
          clearManualMove: true,
          source: "WorkstationHub",
        });
        showSuccess(`Product ${product.lotNumber} correct ingesteld voor ${targetStation}`);
        return;
      } catch (error) {
        console.error("Fout bij doorsturen:", error);
        showError("Kon product niet doorsturen", "Fout");
        return;
      }
    }

    try {
      const bulkUnits = Array.isArray(options?.bulkUnits)
        ? options.bulkUnits.filter(Boolean)
        : [];
      const targets = bulkUnits.length > 0 ? bulkUnits : [product];

      // Haal operators op voor station "LOSSEN" (Centrale losplaats)
      const lossenOperators = occupancy
        .filter((occ: any) => {
          const stationName = (occ.station || occ.machineId || "").toUpperCase();
          if (stationName !== "LOSSEN") return false;
          
          if (!occ.date) return false;
          const occDate = toDateSafe(occ.date) || new Date();
          occDate.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          return occDate.getTime() === today.getTime() && isShiftActive(occ.shift);
        })
        .map((occ: OccupancyEntry) => occ.operatorNumber)
        .filter(Boolean);

      const routingResult = (await routeTrackedProductsToLossen({
        productIds: targets.map((target: any) => target?.id || target?.lotNumber).filter(Boolean) as string[],
        originStation: selectedStation,
        centralStation: "LOSSEN",
        centralOperators: lossenOperators.filter(Boolean) as string[],
        actorLabel: currentUser?.email || "Operator",
        source: "WorkstationHub",
      })) as RoutingToLossenResult;

      await logWorkstationActivity(
        "PRODUCT_TO_LOSSEN",
        `Doorgestuurd naar lossen: ${targets.length} lot(s), station ${selectedStation}`
      );
      if (routingResult?.switchedToLossenTab) {
        setActiveTab("lossen");
      }
    } catch (error) {
      console.error("Fout bij proces:", error);
      showError("Kon status niet updaten", "Fout bij proces");
    }
  };

    const handleRepairComplete = async (data: RepairCompletePayload) => {
      const itemToRepair = useWorkstationStore.getState().itemToRepair;
      if (!itemToRepair) return;
      try {
        await completeTrackedProductRepair({
          productId: String(itemToRepair.id || itemToRepair.lotNumber || ""),
          station: "BH31",
          actions: data.actions || [],
          note: data.notes || "",
          actorLabel: currentUser?.email || "Operator",
          source: "WorkstationHub",
        });
          await logWorkstationActivity(
            "QUALITY_REPAIR_COMPLETE",
            `Reparatie afgerond: lot ${itemToRepair?.lotNumber || itemToRepair?.id}, BH31 -> BM01`
          );
          showSuccess(`Product ${itemToRepair.lotNumber} gerepareerd en doorgestuurd naar BM01`);
          useWorkstationStore.getState().setShowRepairModal(false);
          useWorkstationStore.getState().setItemToRepair(null);
      } catch (err) {
          console.error("Fout bij reparatie afronden:", err);
          showError("Kon reparatie niet opslaan");
      }
  };

    const handleOpenProductInfo = async (productId: string) => {
    try {
      const productSnap = await getDoc(
        doc(db, `${getPathString(PATHS.PRODUCTS)}/${productId}`)
      );
      if (productSnap.exists()) {
        useWorkstationStore.getState().setLinkedProductData({ id: productSnap.id, ...(productSnap.data() as Omit<TrackedProductDoc, "id">) });
      } else {
        showWarning(t("digitalplanning.workstation.product_not_found"), t("digitalplanning.workstation.not_found"));
      }
    } catch (error) {
      console.error(error);
      showError(t("digitalplanning.workstation.product_load_error"), t("digitalplanning.workstation.load_error"));
    }
  };

    const handleActiveUnitClick = (unit: TrackedProductDoc) => {
    const parentOrder = rawOrders.find((o: PlanningOrder) => o.orderId === unit.orderId);
    if (parentOrder && parentOrder.linkedProductId) {
      handleOpenProductInfo(String(parentOrder.linkedProductId));
    } else if (unit.originalOrderId) {
      const origOrder = rawOrders.find(
        (o: PlanningOrder) => o.orderId === unit.originalOrderId
      );
      if (origOrder && origOrder.linkedProductId)
        handleOpenProductInfo(String(origOrder.linkedProductId));
      else showWarning(t("digitalplanning.workstation.no_dossier_for_order", { order: unit.originalOrderId }), t("digitalplanning.workstation.dossier_missing"));
    } else {
      showWarning(t("digitalplanning.workstation.no_dossier_linked", { order: unit.orderId }), t("digitalplanning.workstation.dossier_missing"));
    }
  };

    const handleCancelProduction = async (productId: string) => {
    if (!productId) return;

    // Optioneel product opzoeken voor details (lotnummer), maar niet vereist
    const product = rawProducts.find((p: TrackedProductDoc) => p.id === productId);
    const cancelProductRef = String(product?.__docPath || productId || "").trim();

    try {
      await cancelTrackedProduction({
        productId: cancelProductRef,
        selectedStation,
        source: "WorkstationHub",
        actorLabel: currentUser?.email || undefined,
      });

      await logWorkstationActivity(
        "PRODUCTION_CANCEL",
        `Production cancelled for lot ${product?.lotNumber || productId} on ${selectedStation}`
      );
      showSuccess(t("digitalplanning.workstation.cancel_success", "Productie geannuleerd"));
    } catch (err) {
      console.error("Error cancelling production:", err);
      showError(t("digitalplanning.workstation.cancel_error", "Fout bij annuleren"));
    }
  };

    const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (contentRef.current && contentRef.current.scrollTop === 0) {
      setPullStartY(e.touches[0].clientY);
    }
  };

    const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (pullStartY > 0 && contentRef.current && contentRef.current.scrollTop === 0) {
      const touchY = e.touches[0].clientY;
      const diff = touchY - pullStartY;
      if (diff > 0) {
        // Weerstand toevoegen (max 120px pull)
        setPullDistance(Math.min(diff * 0.4, 120));
      }
    }
  };

    const handleTouchEnd = () => {
    if (pullDistance > 60) {
      setIsRefreshing(true);
      setTimeout(() => window.location.reload(), 500);
    } else {
      setPullDistance(0);
      setPullStartY(0);
    }
  };
    
    return {
        handleOperatorCheckout,
        toggleMachineStoring,
        logWorkstationActivity,
        requestNotificationPermission,
        showInstallInstructions,
        handleOperatorShiftCheckin,
        handleSaveHourCorrection,
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
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd
    };
};
