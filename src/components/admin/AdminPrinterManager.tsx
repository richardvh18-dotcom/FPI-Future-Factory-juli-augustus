
import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { jsPDF } from "jspdf";
import * as QRCode from "qrcode";
import { 
  Printer, 
  Plus, 
  Trash2, 
  Save, 
  Play,
  X,
  MapPin,
  Edit,
  Usb,
  List,
  Server,
  QrCode,
  Hash,
  Tag,
  Search,
  Crosshair,
  Loader2,
  Activity,
  CheckCircle,
  AlertCircle,
  WifiOff,
  PauseCircle,
} from "lucide-react";
import { 
  collection, 
  collectionGroup,
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  doc, 
  updateDoc, 
  setDoc,
  serverTimestamp,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  documentId,
  type DocumentData,
  type QuerySnapshot,
} from "firebase/firestore";
import { getDriver, applyCalibration, PRINTER_DRIVERS } from "../../utils/printerDrivers";
import { queuePrintJob } from "../../services/planningSecurityService";
import { generatePrintData } from "../../utils/zplHelper";
import {
  processLabelData,
  resolveLabelContent,
  applyLabelLogic,
  filterTempOrderLabelsByProduct,
} from "../../utils/labelHelpers";
import PrintQueueAdminView from "../printer/PrintQueueAdminView";
import AutoScaledLabelPreview from "../printer/AutoScaledLabelPreview";
import InternalQrImage from "../../utils/InternalQrImage";
import { useNotifications } from "../../contexts/NotificationContext";
import { logComplianceEvent } from "../../services/complianceAudit";
import { useLabelCatalog } from "../../hooks/useLabelCatalog";
import { useFormPersistence } from "../../hooks/useFormPersistence";
import { serializeRoutingKeys } from "../../utils/printRouting";
import { renderLabelToBitmapZpl } from "../../utils/zebraLabelRenderEngine";
import { normalizePrinterProtocol, renderLabelForPrinter } from "../../utils/printerProtocolService";
import { db, auth, logActivity } from "../../config/firebase";
import { PATHS, getPathString } from "../../config/dbPaths";
import { isUsbDirectSupported, requestUsbDevice, printRawUsb, printBinaryUsbToDevice, resolveUsbDeviceForPrinter } from "../../utils/usbPrintService";
import { buildTsplUsbPayload, renderLabelToBitmapTspl } from "../../utils/tsplPrintService";
import { executeOrderLabelSearch, loadFactoryMachinePaths, normalizeText } from "../../utils/orderLabelSearch";
import {
  buildOrderLabelPreviewData,
  buildOrderLabelTemplateProduct,
} from "../../utils/orderLabelTemplateUtils";
import { isPrinterOnline } from "../../utils/printerStatus";
import { loadPrinterStatusHistory, type PrinterStatusRecord } from "../../utils/printerStatus";
import { queryAndSavePrinterStatusUsb } from "../../utils/usbPrintService";
import { resolvePreferredQueueDepartment } from "../../utils/printerQueueStationUtils";


import { useAdminPrinterManager } from './useAdminPrinterManager';
import LotPrintModal from './modals/AdminLotPrintModal';
import TempLabelModal from './modals/AdminTempLabelModal';
import CalibrationModal from './modals/CalibrationModal';
import { getConnectionLabel, buildCalibrationCrossZpl, buildLabelaryPreviewUrl, CONNECTION_TYPES, DEFAULT_PRINTER_FORM, getIsoWeekAndYear, getMachineCode, normalizeProtocol, normalizeRollType, normalizeUsbSerial, normalizeZplTextFont, parseMm, PRINT_SETTINGS_KEY, PRINTER_PROTOCOLS, resolveRollWidthMm, PrinterRecord, PrinterFormData, TempOrderRecord, PrinterProtocol, PrinterConnectionType, getErrMsg, colPath, docPath, MAX_USB_ID, timestampToMillis, LabelTemplate, resolveStableUsbSerial, parseUsbId, normalizePrinterType } from './adminPrinterHelpers';

const AdminPrinterManager = ({ onNavigate }: { onNavigate?: (screen: string | null) => void }) => {
  const { t } = useTranslation();
  const { showError, showSuccess } = useNotifications();
  const {
    activeTab,
    setActiveTab,
    availableDepartments,
    availableStations,
    calibrationPrinter,
    setCalibrationPrinter,
    checkingStatus,
    setCheckingStatus,
    clearPersistedPrinterForm,
    editingId,
    setEditingId,
    error,
    formData,
    setFormData,
    handleAddQueueStation,
    handleApplyCalibration,
    handleBulkLotPrint,
    handleCalibrationPrint,
    handleDelete,
    handleEdit,
    handleLengthTestPrint,
    handlePairUsb,
    handlePrintA4QrPdf,
    handleRemoveQueueStation,
    handleSave,
    handleTempLegacyPrint,
    handleTestPrint,
    handleToggleWindowsHostMode,
    handleTsplDiagSend,
    handleUsbResetReconnect,
    isAdding,
    setIsAdding,
    isSavingQueueStations,
    labelLogicRules,
    labelTemplates,
    loading,
    loadingStatusHistory,
    setLoadingStatusHistory,
    manualStatusResult,
    setManualStatusResult,
    printers,
    printerStatusHistory,
    setPrinterStatusHistory,
    queueStations,
    queueStationToAdd,
    setQueueStationToAdd,
    savingWindowsHostMode,
    selectedQueueDepartment,
    setSelectedQueueDepartment,
    selectedQueuePrinterId,
    setSelectedQueuePrinterId,
    showLotModal,
    setShowLotModal,
    showTempModal,
    setShowTempModal,
    showTestMenu,
    setShowTestMenu,
    tsplDiagCommands,
    setTsplDiagCommands,
    tsplDiagPrinter,
    setTsplDiagPrinter,
    tsplDiagStatus,
    setTsplDiagStatus,
    windowsHostMode
  } = useAdminPrinterManager({ onNavigate });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-black text-slate-800 uppercase italic">{t('common.printerManagement')}</h2>
          <p className="text-sm text-slate-500 font-bold">{t('common.configurePrinters')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTempModal(true)}
            className="bg-amber-500 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-amber-600 transition-all shadow-sm"
          >
            <Tag size={16} /> Order Labels
          </button>
          <button
            onClick={() => setShowLotModal(true)}
            className="bg-purple-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-purple-700 transition-all"
          >
            <Hash size={16} /> Lotnummers
          </button>
          <button 
            onClick={handlePrintA4QrPdf}
            className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-emerald-700 transition-all"
          >
            <QrCode size={16} /> Print 'OK' QR (A4)
          </button>
          <button 
            onClick={() => {
              setEditingId(null);
              clearPersistedPrinterForm();
              setFormData(DEFAULT_PRINTER_FORM);
              setIsAdding(true);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold uppercase text-xs tracking-wider flex items-center gap-2 hover:bg-blue-700 transition-all"
          >
            <Plus size={16} /> {t('common.newPrinter')}
          </button>
        </div>
      </div>

      {/* TABS */}
      <div className="flex gap-2 border-b border-slate-200 pb-1 mb-6">
        <button
          onClick={() => setActiveTab("config")}
          className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${
            activeTab === "config" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <Printer size={16} /> Printer Config
        </button>
        <button
          onClick={() => setActiveTab("queue-stations")}
          className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${
            activeTab === "queue-stations" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <MapPin size={16} /> Queue Stations
        </button>
        <button
          onClick={() => setActiveTab("queue")}
          className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${
            activeTab === "queue" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <List size={16} /> Print Wachtrij
        </button>
        <button
          onClick={() => {
            if (editingId) {
              setActiveTab("status-history");
              setLoadingStatusHistory(true);
              const editingPrinter = printers.find(p => p.id === editingId);
              if (editingPrinter) {
                loadPrinterStatusHistory(editingPrinter.id, 7)
                  .then((records) => setPrinterStatusHistory(records))
                  .catch(() => setPrinterStatusHistory([]))
                  .finally(() => setLoadingStatusHistory(false));
              } else {
                setLoadingStatusHistory(false);
              }
            } else {
              setActiveTab("status-history");
            }
          }}
          className={`px-6 py-3 rounded-2xl font-black uppercase text-xs tracking-widest transition-all flex items-center gap-2 ${
            activeTab === "status-history" ? "bg-slate-900 text-white shadow-lg" : "bg-white text-slate-500 hover:bg-slate-50 border border-slate-200"
          }`}
        >
          <Activity size={16} /> {t('printerStatus.historyTab', 'Statushistorie')}
        </button>
      </div>

      {activeTab === "config" && (
      <>
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{t("adminPrinterManager.temporaryPilotMode", "Tijdelijke Pilot Modus")}</p>
            <h3 className="text-base font-black text-slate-800 uppercase flex items-center gap-2">
              <Server size={16} /> Windows Print Host
            </h3>
            <p className="text-sm text-slate-500 font-semibold mt-1">
              Schakel hier centraal tussen bestaande USB/WebUSB flow en tijdelijke Windows-printerdialoog flow (op de host-pc).
            </p>
          </div>
          <button
            onClick={handleToggleWindowsHostMode}
            disabled={savingWindowsHostMode}
            className={`px-4 py-2 rounded-xl font-black uppercase text-xs tracking-widest transition-all border-2 disabled:opacity-60 disabled:cursor-not-allowed ${
              windowsHostMode
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-slate-600 border-slate-300 hover:border-amber-300'
            }`}
          >
            {savingWindowsHostMode ? 'Opslaan...' : (windowsHostMode ? 'Windows Host AAN' : 'Windows Host UIT')}
          </button>
        </div>
      </div>

      {isAdding && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto" onClick={() => { setIsAdding(false); setEditingId(null); }}>
          <div className="bg-white p-6 rounded-2xl border-2 border-blue-100 shadow-xl w-full max-w-4xl my-auto max-h-[90vh] overflow-y-auto animate-in zoom-in-95 fade-in duration-200" onClick={e => e.stopPropagation()}>
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-black text-slate-700 uppercase">{editingId ? t('adminPrinterManager.editPrinter') : t('adminPrinterManager.addNewPrinter')}</h3>
            <button onClick={() => { setIsAdding(false); setEditingId(null); }}><X size={20} className="text-slate-400" /></button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('adminPrinterManager.name')}</label>
              <input 
                type="text" 
                placeholder={t('adminPrinterManager.printerNamePlaceholder')}
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Hoofdcategorie / Afdeling (Optioneel)</label>
              <select 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                value={formData.department}
                onChange={e => setFormData({...formData, department: e.target.value})}
              >
                <option value="">— Geen Categorie —</option>
                {availableDepartments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Specifieke Locatie (Optioneel)</label>
              <input 
                type="text" 
                placeholder="bijv. Bij BH18 of Kantoor"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                value={formData.locationLabel}
                onChange={e => setFormData({...formData, locationLabel: e.target.value})}
              />
            </div>
            


            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('adminPrinterManager.connection')}</label>
              <div className="flex gap-2">
                <select 
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                  value={formData.type}
                  onChange={e => setFormData({...formData, type: normalizePrinterType(e.target.value)})}
                >
                  <option value={CONNECTION_TYPES.WEBUSB}>{t("adminPrinterManager.webUsbZadig", "WebUSB / Zadig")}</option>
                  <option value={CONNECTION_TYPES.WINDOWS_HOST}>{t("adminPrinterManager.directWindowsHost", "Direct via Windows Host")}</option>
                  <option value={CONNECTION_TYPES.NETWORK}>{t("adminPrinterManager.networkIp", "Netwerk (IP)")}</option>
                </select>
              </div>
              
              {normalizePrinterType(formData.type) === CONNECTION_TYPES.WEBUSB && (
                  <div className="mt-2 p-3 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-500 italic flex flex-col justify-center">
                  <div className="flex items-center justify-between gap-2">
                        <span>{formData.deviceName ? `${t("adminPrinterManager.paired", "Gekoppeld")}: ${formData.deviceName}` : t("adminPrinterManager.directUsbPrint", "Directe USB Print")}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={handlePairUsb} className="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-blue-50 text-blue-600 font-bold flex items-center gap-1">
                        <Usb size={14} />
                        {formData.vendorId ? t("adminPrinterManager.pairAgain", "Opnieuw Koppelen") : t("adminPrinterManager.pairPrinter", "Koppel Printer")}
                      </button>
                      <button onClick={handleUsbResetReconnect} className="text-xs bg-white border border-slate-300 px-3 py-1.5 rounded-lg hover:bg-amber-50 text-amber-700 font-bold">
                        {t("adminPrinterManager.usbResetReconnect", "USB Reset + Reconnect")}
                      </button>
                    </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 not-italic">USB Vendor/Product</label>
                        <input
                          type="text"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold not-italic"
                          value={formData.vendorId && formData.productId ? `${formData.vendorId}:${formData.productId}` : ''}
                          readOnly
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 not-italic">USB Unieke ID / Serial</label>
                        <input
                          type="text"
                          placeholder="Bijv. CN23A17K9"
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-bold not-italic"
                          value={formData.usbSerialNumber}
                          onChange={e => setFormData({ ...formData, usbSerialNumber: e.target.value })}
                        />
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-slate-500 not-italic font-semibold">
                      Gebruik dit veld voor 2 identieke printers met dezelfde naam/VID/PID. Tijdens koppelen wordt dit serienummer automatisch ingevuld als de browser het ondersteunt.
                    </p>
                  </div>
              )}

              {normalizePrinterType(formData.type) === CONNECTION_TYPES.WINDOWS_HOST && (
                <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-semibold text-amber-800">
                  Deze printer gebruikt de Windows-printer op de host-pc via de printwachtrij/browserdialoog.
                </div>
              )}

              {normalizePrinterType(formData.type) === CONNECTION_TYPES.NETWORK && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t("adminPrinterManager.ipAddress", "IP Adres")}</label>
                    <input
                      type="text"
                      placeholder={t("placeholders.adminPrinterIpExample", "Bijv. 192.168.1.120")}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                      value={formData.ip}
                      onChange={(e) => setFormData({ ...formData, ip: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t("adminPrinterManager.port", "Poort")}</label>
                    <input
                      type="number"
                      min="1"
                      max="65535"
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold outline-none focus:border-blue-500"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: e.target.value || '9100' })}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">{t('adminPrinterManager.protocol')}</label>
              <select
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:border-blue-500"
                value={formData.protocol}
                onChange={(e) => setFormData({ ...formData, protocol: normalizeProtocol(e.target.value) })}
              >
                {PRINTER_PROTOCOLS.map(protocol => (
                  <option key={protocol} value={protocol}>{t(`adminPrinterManager.protocol${protocol.toUpperCase()}`)}</option>
                ))}
              </select>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 md:col-span-2">
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adminPrinterManager.dpi')}</label>
                    <select className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" value={formData.dpi} onChange={e => setFormData({...formData, dpi: e.target.value})}>
                        <option value="203">203 DPI</option>
                        <option value="300">300 DPI</option>
                        <option value="600">600 DPI</option>
                    </select>
                </div>
                <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t("adminPrinterManager.rollWidthMm", "Rol Breedte (mm)")}</label>
                <input
                  type="number"
                  min="20"
                  step="1"
                  className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                  placeholder={t("placeholders.adminPrinterDpiExample", "90")}
                  value={formData.rollWidthMm}
                  onChange={e => setFormData({ ...formData, rollWidthMm: e.target.value, width: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t("adminPrinterManager.rollType", "Rol Type")}</label>
                <select
                  className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                  value={normalizeRollType(formData.rollType)}
                  onChange={e => setFormData({ ...formData, rollType: normalizeRollType(e.target.value) })}
                >
                  <option value="gap">{t("adminPrinterManager.rollTypeGap", "Stickerrol met onderbreking (GAP)")}</option>
                  <option value="continuous">{t("adminPrinterManager.rollTypeContinuous", "Continue rol")}</option>
                  <option value="mark">{t("adminPrinterManager.rollTypeMark", "Black mark rol")}</option>
                </select>
                </div>
                <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t('adminPrinterManager.darkness')}</label>
                    <input type="number" min="0" max="30" className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" value={formData.darkness} onChange={e => setFormData({...formData, darkness: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t("adminPrinterManager.speedIps", "Speed (ips)")}</label>
                  <input type="number" min="1" max="14" className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold" value={formData.speed} onChange={e => setFormData({...formData, speed: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t("adminPrinterManager.zplFont", "ZPL Font")}</label>
                  <select
                    className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                    value={normalizeZplTextFont(formData.zplTextFont)}
                    onChange={e => setFormData({ ...formData, zplTextFont: normalizeZplTextFont(e.target.value) })}
                  >
                    <option value="0">{t("adminPrinterManager.font0Default", "Font 0 (standaard)")}</option>
                    <option value="A">{t("adminPrinterManager.fontA", "Font A")}</option>
                  </select>
                </div>
            </div>

            {/* Driver Model Selector */}
            <div className="md:col-span-2">
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t("adminPrinterManager.driverModel", "Driver Model")}</label>
                <select
                    className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                    value={formData.driverModel}
                    onChange={e => {
                        const driverKey = e.target.value;
                        const driverDef = PRINTER_DRIVERS[driverKey];
                        // Sync DPI en darkness automatisch mee als driver gekozen wordt
                        setFormData({
                            ...formData,
                            driverModel: driverKey,
                            ...(driverDef ? {
                                dpi: String(driverDef.nativeDpi),
                                darkness: String(driverDef.defaultDarkness),
                              speed: String(driverDef.defaultSpeed),
                            } : {})
                        });
                    }}
                >
                    <option value="">{t("adminPrinterManager.autoDetectDriver", "— Automatisch detecteren (op naam/DPI) —")}</option>
                    {Object.values(PRINTER_DRIVERS).map(d => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                    ))}
                </select>
                <p className="text-[9px] text-slate-400 mt-1">
                    {t("adminPrinterManager.driverHelp", "Selecteer een driver voor correcte DPI, cut-commando en backfeed-gedrag. Laat leeg voor automatische detectie op naamhint.")}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:col-span-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t("adminPrinterManager.calibrationXOffset", "Calibratie X Offset (mm)")}</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                  value={formData.calibrationOffsetXMm}
                  onChange={e => setFormData({ ...formData, calibrationOffsetXMm: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">{t("adminPrinterManager.calibrationYOffset", "Calibratie Y Offset (mm)")}</label>
                <input
                  type="number"
                  step="0.1"
                  className="w-full p-2 bg-slate-50 border rounded-lg text-xs font-bold"
                  value={formData.calibrationOffsetYMm}
                  onChange={e => setFormData({ ...formData, calibrationOffsetYMm: e.target.value })}
                />
              </div>
            </div>

            <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.bitmapPrintEnabled}
                  onChange={e => setFormData({ ...formData, bitmapPrintEnabled: e.target.checked })}
                  className="w-4 h-4 mt-0.5"
                />
                <span>
                  <span className="block text-xs font-black text-slate-700 uppercase tracking-wider">{t("adminPrinterManager.bitmapPrintForPrinter", "Bitmap print voor deze printer")}</span>
                  <span className="block text-xs text-slate-500 mt-1">
                    {t("adminPrinterManager.bitmapPrintHelp", "Print labels als 1-op-1 rasterbitmap vanaf de preview. Deze instelling geldt alleen voor deze opgeslagen printer.")}
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-50 rounded-lg">{t('common.cancel')}</button>
            <button onClick={handleSave} className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 flex items-center gap-2">
              <Save size={16} /> {t('common.save')}
            </button>
          </div>
        </div>
        </div>
      )}

      {showLotModal && (
        <LotPrintModal onClose={() => setShowLotModal(false)} stations={availableStations} printers={printers} onPrint={handleBulkLotPrint} />
      )}

      {showTempModal && (
        <TempLabelModal
          onClose={() => setShowTempModal(false)}
          printers={printers}
          labelTemplates={labelTemplates}
          labelRules={labelLogicRules}
          onPrint={handleTempLegacyPrint}
          onOpenTemplateManager={() => {
            setShowTempModal(false);
            onNavigate?.("label_manager");
          }}
        />
      )}

      {calibrationPrinter && (
        <CalibrationModal
          printer={calibrationPrinter}
          onClose={() => setCalibrationPrinter(null)}
          onPrint={(cfg) => handleCalibrationPrint(calibrationPrinter, cfg)}
          onApply={(payload) => handleApplyCalibration(calibrationPrinter, payload)}
        />
      )}

      {tsplDiagPrinter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div>
                <h3 className="font-black text-slate-800">TSPL Diagnostiek</h3>
                <p className="text-xs text-indigo-600 font-semibold mt-0.5">{tsplDiagPrinter.name}</p>
              </div>
              <button onClick={() => setTsplDiagPrinter(null)} className="p-2 hover:bg-slate-100 rounded-lg">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500">Voer ruwe TSPL-commando's in. Ze worden direct via WebUSB naar de printer gestuurd.</p>
              <textarea
                className="w-full h-48 font-mono text-xs border border-slate-200 rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-y"
                value={tsplDiagCommands}
                onChange={(e) => { setTsplDiagCommands(e.target.value); setTsplDiagStatus('idle'); }}
                spellCheck={false}
              />
              {tsplDiagStatus === 'ok' && <p className="text-xs text-emerald-600 font-semibold">✓ Verzonden naar printer.</p>}
              {tsplDiagStatus === 'error' && <p className="text-xs text-rose-600 font-semibold">✗ Verzenden mislukt — zie foutmelding hierboven.</p>}
            </div>
            <div className="flex gap-2 justify-end p-5 border-t border-slate-100">
              <button onClick={() => setTsplDiagPrinter(null)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Sluiten</button>
              <button
                onClick={handleTsplDiagSend}
                disabled={tsplDiagStatus === 'sending' || !tsplDiagCommands.trim()}
                className="px-4 py-2 text-sm bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {tsplDiagStatus === 'sending' ? 'Versturen...' : 'Versturen naar printer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {printers.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400 italic">{t('adminPrinterManager.noPrintersConfigured')}</div>
        )}
        
        {(() => {
          const groupedPrinters = printers.reduce((acc, printer) => {
            const dept = printer.department || 'Geen Categorie / Overig';
            if (!acc[dept]) acc[dept] = [];
            acc[dept].push(printer);
            return acc;
          }, {} as Record<string, PrinterRecord[]>);

          const departments = Object.keys(groupedPrinters).sort((a, b) => {
            if (a === 'Geen Categorie / Overig') return 1;
            if (b === 'Geen Categorie / Overig') return -1;
            return a.localeCompare(b);
          });

          return departments.map(dept => (
            <details key={dept} className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden group">
              <summary className="p-4 cursor-pointer font-black text-slate-700 uppercase tracking-widest flex justify-between items-center bg-slate-100 hover:bg-slate-200 transition-colors select-none">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 group-open:rotate-90 transition-transform">▶</span>
                  <span>{dept} <span className="opacity-50 text-xs ml-2">({groupedPrinters[dept].length})</span></span>
                </div>
              </summary>
              <div className="p-4 grid gap-4 bg-slate-50">
                {groupedPrinters[dept].map(printer => (
                  (() => {
                    const printerType = normalizePrinterType(printer.type);
                    const iconColors = printerType === CONNECTION_TYPES.NETWORK
                      ? 'bg-blue-50 text-blue-600'
                      : printerType === CONNECTION_TYPES.WINDOWS_HOST
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-orange-50 text-orange-600';

                    return (
                      <div key={printer.id} className="bg-white p-4 rounded-2xl border-2 transition-all flex items-center justify-between border-slate-100">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-xl ${iconColors}`}>
                            <Printer size={24} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-black text-slate-800">{printer.name}</h3>
                              {printer.locationLabel && (
                                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase border border-indigo-100 flex items-center gap-1">
                                  <MapPin size={10} />
                                  {printer.locationLabel}
                                </span>
                              )}
                              {(() => {
                                const isOnline = isPrinterOnline(printer as import('../../utils/printerStatus').PrinterStatusLike);
                                return (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`}></div>
                                    {isOnline ? 'Verbonden' : 'Offline'}
                                  </span>
                                );
                              })()}
                            </div>
                            <p className="text-xs font-bold text-slate-400 font-mono mt-0.5">
                              {printerType === CONNECTION_TYPES.WEBUSB && (printer.deviceName ? `USB: ${printer.deviceName}` : t("adminPrinterManager.webUsbZadig", "WebUSB / Zadig"))}
                              {printerType === CONNECTION_TYPES.WINDOWS_HOST && t("adminPrinterManager.windowsHostPrint", "Windows Host Print")}
                              {printerType === CONNECTION_TYPES.NETWORK && (printer.ip ? `IP: ${printer.ip}:${printer.port || '9100'}` : t("adminPrinterManager.networkPrinterIpEmpty", "Netwerk printer (IP nog leeg)"))}
                              {printer.dpi && <span className="ml-2 opacity-60 text-[10px]">({printer.dpi} DPI)</span>}
                            </p>
                            {printerType === CONNECTION_TYPES.WEBUSB && (
                              <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                                USB Serial: {String(printer.usbSerialNumber || '').trim() || 'Niet ingesteld'}
                              </p>
                            )}
                            <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                              {t('adminPrinterManager.protocol')}: {((printer.protocol || 'zpl')).toUpperCase()} | {getConnectionLabel(printer.type)}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                              {t("adminPrinterManager.calibration", "Calibratie")}: X {parseMm(printer.calibrationOffsetXMm, 0)}mm | Y {parseMm(printer.calibrationOffsetYMm, 0)}mm
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                              {t("adminPrinterManager.roll", "Rol")}: {resolveRollWidthMm(printer)}mm | {t("adminPrinterManager.type", "Type")}: {normalizeRollType(printer.rollType)}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                              {t("adminPrinterManager.print", "Print")}: {t("adminPrinterManager.darkness", "Darkness")} {printer.darkness || getDriver(printer).defaultDarkness} | {t("adminPrinterManager.speed", "Speed")} {printer.speed || getDriver(printer).defaultSpeed} ips
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                              {t("adminPrinterManager.zplTextFont", "ZPL tekstfont")}: {normalizeZplTextFont(printer.zplTextFont)}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                              {t("adminPrinterManager.bitmapPrint", "Bitmap print")}: {printer.bitmapPrintEnabled ? t("common.on", "Aan") : t("common.off", "Uit")}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                              {t("adminPrinterManager.routingKeys", "Routeringstags")}: {(Array.isArray(printer.routingKeys) ? printer.routingKeys : []).length > 0 ? (Array.isArray(printer.routingKeys) ? printer.routingKeys.join(", ") : "") : t("adminPrinterManager.noRoutingKeys", "Geen")}
                            </p>
                            <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase">
                              {t("adminPrinterManager.queueStationsForPrinter", "Queue stations")}: {(Array.isArray(printer.queueStations) ? printer.queueStations : (Array.isArray(printer.linkedStations) ? printer.linkedStations : [])).length > 0
                                ? (Array.isArray(printer.queueStations) ? printer.queueStations : (Array.isArray(printer.linkedStations) ? printer.linkedStations : [])).join(", ")
                                : t("adminPrinterManager.noQueueStationsSelected", "Geen specifieke stations")}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-1 flex flex-wrap gap-1">
                                {(Array.isArray(printer.queueStations) ? printer.queueStations : (Array.isArray(printer.linkedStations) ? printer.linkedStations : [])).length > 0
                                    ? (Array.isArray(printer.queueStations) ? printer.queueStations : (Array.isArray(printer.linkedStations) ? printer.linkedStations : [])).map(s => <span key={s} className="bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">{s}</span>)
                                    : <span className="italic opacity-50">{t('adminPrinterManager.noSpecificStations')}</span>}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <button 
                              onClick={() => setShowTestMenu(printer.id === showTestMenu ? null : printer.id)}
                              disabled={printerType !== CONNECTION_TYPES.WEBUSB}
                              className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title={printerType === CONNECTION_TYPES.WEBUSB ? t('adminPrinterManager.testPrint') : t("adminPrinterManager.testPrintWebUsbOnly", "Testprint is alleen beschikbaar voor WebUSB/Zadig printers")}
                            >
                              <Play size={18} />
                            </button>
                            {showTestMenu === printer.id && (
                              <div className="absolute right-0 bottom-full mb-2 w-48 bg-white border border-slate-200 rounded-lg shadow-lg z-10 py-1">
                                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase">{t("adminPrinterManager.testLengths", "Test Lengtes")}</div>
                                <button onClick={() => handleLengthTestPrint(printer, 25)} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">{t("adminPrinterManager.test90x25", "Test 90x25mm")}</button>
                                <button onClick={() => handleLengthTestPrint(printer, 50)} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">{t("adminPrinterManager.test90x50", "Test 90x50mm")}</button>
                                <button onClick={() => handleLengthTestPrint(printer, 100)} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">{t("adminPrinterManager.test90x100", "Test 90x100mm")}</button>
                                <div className="h-px bg-slate-100 my-1"></div>
                                <button onClick={() => handleTestPrint(printer)} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">{t("adminPrinterManager.standardTestLabel", "Standaard Testlabel")}</button>
                                <button onClick={() => { setShowTestMenu(null); setCalibrationPrinter(printer); }} className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50">{t("adminPrinterManager.calibrationPrintOffsets", "Calibratie print + offsets")}</button>
                                {String(printer.protocol || '').toLowerCase() === 'tspl' && (
                                  <>
                                    <div className="h-px bg-slate-100 my-1"></div>
                                    <div className="px-3 py-1 text-[10px] font-bold text-indigo-400 uppercase">TSPL / Lighthouse</div>
                                    <button onClick={() => { setShowTestMenu(null); setTsplDiagStatus('idle'); setTsplDiagPrinter(printer); }} className="block w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 text-indigo-700">Ruwe TSPL commando's sturen</button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          <button 
                            onClick={() => handleEdit(printer)}
                            className="p-2 text-slate-300 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title={t('common.edit')}
                          >
                            <Edit size={18} />
                          </button>
                          <button 
                            onClick={() => handleDelete(printer.id)}
                            className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title={t('common.delete')}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    );
                  })()
                ))}
              </div>
            </details>
          ));
        })()}
      </div>
      </>
      )}

      {activeTab === "queue-stations" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <h3 className="text-lg font-black text-slate-800 uppercase mb-1">{t("adminPrinterManager.queueStations", "Queue voor stations")}</h3>
          <p className="text-sm text-slate-500 font-semibold mb-4">
            {t("adminPrinterManager.queueStationsHelp", "Selecteer per printer eerst een afdeling en daarna de stations die de queue ontvangt en print. De stations komen uit de factory-config.")}
          </p>

          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <select
              value={selectedQueueDepartment}
              onChange={(e) => {
                setSelectedQueueDepartment(e.target.value);
                setSelectedQueuePrinterId("");
                setQueueStationToAdd("");
              }}
              className="w-full md:w-1/3 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              disabled={availableDepartments.length === 0 || isSavingQueueStations}
            >
              <option value="">{t("adminPrinterManager.selectDepartment", "1. Selecteer afdeling...")}</option>
              {availableDepartments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>

            <select
              value={selectedQueuePrinterId}
              onChange={(e) => {
                setSelectedQueuePrinterId(e.target.value);
                setQueueStationToAdd("");
              }}
              className="w-full md:w-1/3 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              disabled={printers.length === 0 || !selectedQueueDepartment || isSavingQueueStations}
            >
              <option value="">{t("adminPrinterManager.selectPrinter", "2. Kies printer uit afdeling...")}</option>
              {printers.filter(p => (p.department || "Geen Categorie / Overig") === selectedQueueDepartment).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              value={queueStationToAdd}
              onChange={(e) => setQueueStationToAdd(e.target.value)}
              className="w-full md:w-1/3 p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-sm"
              disabled={isSavingQueueStations || !selectedQueuePrinterId || availableStations.length === 0}
            >
              <option value="">{t("adminPrinterManager.selectStationFromFactoryConfig", "3. Selecteer station...")}</option>
              {availableStations
                .filter((s) => !queueStations.includes(s))
                .map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
            </select>
          </div>

          <div className="mb-4">
            <button
              onClick={handleAddQueueStation}
              disabled={!queueStationToAdd || isSavingQueueStations || !selectedQueuePrinterId}
              className="px-4 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-widest hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingQueueStations ? t("common.saving", "Opslaan...") : t("common.add", "Station Koppelen")}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {queueStations.length === 0 && (
              <p className="text-sm text-slate-400 italic">{t("adminPrinterManager.noQueueStationsSelected", "Nog geen queue stations geselecteerd.")}</p>
            )}
            {queueStations.map((station) => (
              <span key={station} className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 border border-blue-200">
                {station}
                <button
                  onClick={() => handleRemoveQueueStation(station)}
                  className="hover:text-blue-900"
                  disabled={isSavingQueueStations}
                  title={t("common.delete", "Verwijderen")}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {activeTab === "queue" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <PrintQueueAdminView />
        </div>
      )}

      {activeTab === "status-history" && (() => {
        const editingPrinter = printers.find(p => p.id === editingId);
        const lastStatus = manualStatusResult ?? (printerStatusHistory.length > 0 ? printerStatusHistory[0] : null);

        const statusBadge = (status: string) => {
          if (status === 'ready') return { icon: <CheckCircle size={16} className="text-emerald-600" />, label: t('printerStatus.ready', 'Gereed'), bg: 'bg-emerald-50 border-emerald-200 text-emerald-700' };
          if (status === 'paper_out') return { icon: <AlertCircle size={16} className="text-red-600" />, label: t('printerStatus.paperOut', 'Papier op'), bg: 'bg-red-50 border-red-200 text-red-700' };
          if (status === 'head_open') return { icon: <AlertCircle size={16} className="text-orange-600" />, label: t('printerStatus.headOpen', 'Kop open'), bg: 'bg-orange-50 border-orange-200 text-orange-700' };
          if (status === 'ribbon_out') return { icon: <AlertCircle size={16} className="text-orange-600" />, label: t('printerStatus.ribbonOut', 'Lint op'), bg: 'bg-orange-50 border-orange-200 text-orange-700' };
          if (status === 'paused') return { icon: <PauseCircle size={16} className="text-yellow-600" />, label: t('printerStatus.paused', 'Gepauzeerd'), bg: 'bg-yellow-50 border-yellow-200 text-yellow-700' };
          if (status === 'offline') return { icon: <WifiOff size={16} className="text-slate-500" />, label: t('printerStatus.offline', 'Offline'), bg: 'bg-slate-50 border-slate-200 text-slate-600' };
          return { icon: <AlertCircle size={16} className="text-red-600" />, label: t('printerStatus.error', 'Fout'), bg: 'bg-red-50 border-red-200 text-red-700' };
        };

        const handleManualUsbCheck = async () => {
          if (!editingPrinter) return;
          setCheckingStatus(true);
          try {
            const { findAuthorizedUsbDevice } = await import('../../utils/usbPrintService');
            const device = await findAuthorizedUsbDevice({
              vendorId: editingPrinter.vendorId,
              productId: editingPrinter.productId,
              usbSerialNumber: editingPrinter.usbSerialNumber,
            });
            if (!device) {
              showError(t('printerStatus.noUsbDevice', 'Geen USB-printer gevonden. Koppel de printer en kies hem via de browser.'));
              return;
            }
            if (!device.opened) await device.open();
            if (!device.configuration) await device.selectConfiguration(1);
            const result = await queryAndSavePrinterStatusUsb(device, editingPrinter.id, editingPrinter.name ?? 'Printer', 'manual');
            if (result) {
              const record: PrinterStatusRecord = {
                ...result,
                id: 'manual-' + Date.now(),
                printerId: editingPrinter.id,
                printerName: editingPrinter.name ?? 'Printer',
                timestamp: result.checkedAt,
              };
              setManualStatusResult(record);
              setPrinterStatusHistory(prev => [record, ...prev]);
            }
          } catch (err: unknown) {
            showError(t('printerStatus.checkFailed', 'Statuscheck mislukt') + ': ' + String(err instanceof Error ? err.message : err));
          } finally {
            setCheckingStatus(false);
          }
        };

        return (
          <div className="space-y-5">
            {!editingPrinter ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <Activity size={32} className="mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500 font-bold">{t('printerStatus.selectPrinterFirst', 'Selecteer een printer om de statushistorie te zien.')}</p>
                <p className="text-slate-400 text-sm mt-1">{t('printerStatus.selectPrinterHint', 'Klik op "Bewerken" bij een printer in de Config-tab.')}</p>
              </div>
            ) : (
              <>
                {/* Huidige status */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{t('printerStatus.currentStatus', 'Huidige status')}</p>
                      <h3 className="text-base font-black text-slate-800">{editingPrinter.name}</h3>
                    </div>
                    <div className="flex items-center gap-3">
                      {lastStatus ? (() => {
                        const badge = statusBadge(lastStatus.status);
                        return (
                          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border font-bold text-sm ${badge.bg}`} title={lastStatus.nativeCodes.join(', ') + (lastStatus.rawResponse ? '\n\n~HS: ' + lastStatus.rawResponse.slice(0, 80) : '')}>
                            {badge.icon}
                            <span>{badge.label}</span>
                            {lastStatus.nativeCodes.length > 0 && lastStatus.nativeCodes[0] !== 'NO_RESPONSE' && (
                              <span className="font-mono text-xs opacity-70 ml-1">[{lastStatus.nativeCodes.join(', ')}]</span>
                            )}
                          </div>
                        );
                      })() : (
                        <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-400 font-bold text-sm">
                          <WifiOff size={16} />
                          <span>{t('printerStatus.noDataYet', 'Nog geen statusdata')}</span>
                        </div>
                      )}
                      {lastStatus && (
                        <span className="text-xs text-slate-400 font-mono">
                          {new Date(lastStatus.checkedAt).toLocaleString('nl-NL')}
                          {' · '}
                          {lastStatus.triggeredBy === 'manual' ? t('printerStatus.manual', 'Handmatig') : t('printerStatus.afterPrint', 'Na print')}
                        </span>
                      )}
                    </div>
                  </div>
                  {lastStatus?.errors && lastStatus.errors.length > 0 && (
                    <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl">
                      {lastStatus.errors.map((e, i) => (
                        <p key={i} className="text-sm font-bold text-red-700">⚠️ {e}</p>
                      ))}
                    </div>
                  )}

                  {/* Handmatige status knop — alleen voor WebUSB printers */}
                  {editingPrinter.type === 'webusb' && (
                    <div className="mt-4 flex justify-end">
                      <button
                        onClick={handleManualUsbCheck}
                        disabled={checkingStatus}
                        className="px-4 py-2 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-wider hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                      >
                        {checkingStatus
                          ? <><Loader2 size={14} className="animate-spin" /> {t('printerStatus.checking', 'Controleren...')}</>
                          : <><Activity size={14} /> {t('printerStatus.checkNow', 'Controleer Status')}</>
                        }
                      </button>
                    </div>
                  )}
                </div>

                {/* 7-dagen geschiedenis tabel */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest flex items-center gap-2">
                      <Activity size={16} /> {t('printerStatus.history7Days', 'Statushistorie (7 dagen)')}
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">{printerStatusHistory.length} {t('printerStatus.records', 'records')}</span>
                  </div>
                  {loadingStatusHistory ? (
                    <div className="p-8 text-center text-slate-400">
                      <Loader2 size={24} className="mx-auto animate-spin mb-2" />
                      <p className="font-bold text-sm">{t('common.loading', 'Laden...')}</p>
                    </div>
                  ) : printerStatusHistory.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                      <Activity size={24} className="mx-auto mb-2 opacity-30" />
                      <p className="font-bold text-sm">{t('printerStatus.noHistory', 'Nog geen statusrecords voor deze printer.')}</p>
                      <p className="text-xs mt-1">{t('printerStatus.noHistoryHint', 'Status wordt automatisch bijgehouden na elke printjob.')}</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-100">
                            <th className="px-4 py-3 text-left font-black text-slate-500 uppercase tracking-widest">{t('common.dateTime', 'Datum/Tijd')}</th>
                            <th className="px-4 py-3 text-left font-black text-slate-500 uppercase tracking-widest">{t('common.status', 'Status')}</th>
                            <th className="px-4 py-3 text-left font-black text-slate-500 uppercase tracking-widest">{t('printerStatus.nativeCodes', 'Native codes')}</th>
                            <th className="px-4 py-3 text-left font-black text-slate-500 uppercase tracking-widest">{t('printerStatus.trigger', 'Trigger')}</th>
                            <th className="px-4 py-3 text-left font-black text-slate-500 uppercase tracking-widest">{t('common.errors', 'Meldingen')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {printerStatusHistory.map((record, idx) => {
                            const badge = statusBadge(record.status);
                            return (
                              <tr key={record.id + idx} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${idx === 0 ? 'bg-blue-50/30' : ''}`}>
                                <td className="px-4 py-3 font-mono text-slate-600 whitespace-nowrap">
                                  {new Date(record.timestamp).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border font-bold ${badge.bg}`}>
                                    {badge.icon}
                                    {badge.label}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-mono text-slate-500">
                                  {record.nativeCodes.length > 0 ? record.nativeCodes.join(', ') : '—'}
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${record.triggeredBy === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {record.triggeredBy === 'manual' ? t('printerStatus.manual', 'Handmatig') : t('printerStatus.afterPrint', 'Na print')}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-slate-600 max-w-xs">
                                  {record.errors.length > 0 ? record.errors.join(' ') : <span className="text-emerald-600 font-bold">✓ {t('printerStatus.noErrors', 'Geen meldingen')}</span>}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
};

export default AdminPrinterManager;
