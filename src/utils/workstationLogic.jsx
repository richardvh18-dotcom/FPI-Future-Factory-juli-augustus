import { getISOWeek, getYear } from "date-fns";
import i18n from "../i18n";

/**
 * Workstation Logic Utilities
 * Workstation Logica Hulpmiddelen
 * Helper functies voor WorkstationHub
 */

// Rejection reasons voor afkeur
// Redenen voor afkeur
// Let op: Voor dynamische taalwissel zonder reload, gebruik de functie getRejectionReasons()
export const REJECTION_REASONS = [
  "rejection.notConformDrawing",
  "rejection.wrongDiameter",
  "rejection.surfaceDamage",
  "rejection.crack",
  "rejection.materialShortage",
  "rejection.wrongSpec",
  "rejection.dimensionDeviation",
  "rejection.qualityInsufficient",
  "rejection.other",
];

// Workstation configuratie
export const WORKSTATIONS = [
  { id: "BH11", name: "BH11", category: "winding" },
  { id: "BH12", name: "BH12", category: "winding" },
  { id: "BH15", name: "BH15", category: "winding" },
  { id: "BH16", name: "BH16", category: "winding" },
  { id: "BH17", name: "BH17", category: "winding" },
  { id: "BH18", name: "BH18", category: "winding" },
  { id: "BH31", name: "BH31", category: "winding" },
  { id: "BH05", name: "BH05", category: "pipes" },
  { id: "BH07", name: "BH07", category: "pipes" },
  { id: "BH08", name: "BH08", category: "pipes" },
  { id: "BH09", name: "BH09", category: "pipes" },
  { id: "Mazak", name: "Mazak", category: "post-processing" },
  { id: "Nabewerking", name: "stations.postProcessing", category: "post-processing" },
  { id: "BM01", name: "BM01", category: "inspection" },
  { id: "Station BM01", name: "stations.bm01", category: "inspection" },
];

/**
 * Get ISO week info from a date
 * Haal ISO week informatie op van een datum
 */
export const getISOWeekInfo = (date) => {
  const week = getISOWeek(date);
  const year = getYear(date);
  return { week, year };
};

/**
 * Helper om rejection reasons dynamisch op te halen (bij taalwissel)
 */
export const getRejectionReasons = () => {
  // Retourneer vertaalde redenen volgens huidige taal
  return REJECTION_REASONS.map(r => i18n.t(r));
};
// Helper om station-namen te vertalen
export const getWorkstationName = (name) => {
  // Als de naam een i18n key is, vertaal deze, anders geef de naam terug
  if (typeof name === "string" && name.startsWith("stations.")) {
    return i18n.t(name);
  }
  return name;
};

/**
 * Check if inspection is overdue (more than 7 days)
 * Controleer of inspectie te laat is (meer dan 7 dagen)
 */
export const isInspectionOverdue = (timestampString) => {
  if (!timestampString) return false;
  
  try {
    const inspectionDate = new Date(timestampString);
    const now = new Date();
    const daysSince = (now - inspectionDate) / (1000 * 60 * 60 * 24);
    
    return daysSince > 7;
  } catch (e) {
    return false;
  }
};

/**
 * Get material info from item code
 * Haal materiaal informatie op uit item code
 */
export const getMaterialInfo = (itemCode) => {
  if (!itemCode) return { material: "Unknown", diameter: null };
  
  // Bijvoorbeeld: "PP-50-PN10" -> material: "PP", diameter: 50
  const parts = String(itemCode).split("-");
  
  return {
    material: parts[0] || "Unknown",
    diameter: parts[1] ? parseInt(parts[1]) : null,
    pressure: parts[2] || null,
  };
};
