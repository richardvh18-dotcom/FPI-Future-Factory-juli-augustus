import { db, auth } from "../config/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

/**
 * Stuurt een ZPL printopdracht naar de Firestore wachtrij.
 * Deze wordt opgepikt door de lokale Node.js listener op de productievloer.
 * 
 * @param {string} printerId - De ID van de doelmachine/printer (bijv. "BH18-ZEBRA")
 * @param {string} zplData - De ruwe ZPL code
 * @param {object} metadata - Extra info voor logging (orderId, operator, etc.)
 */
export const queuePrintJob = async (printerId, zplData, metadata = {}) => {
  try {
    const queueRef = collection(db, "future-factory", "production", "print_queue");
    
    const jobData = {
      printerId: printerId,
      zpl: zplData,
      status: "pending", // pending -> printing -> completed
      createdAt: serverTimestamp(),
      createdBy: auth.currentUser?.uid || "unknown",
      metadata: {
        ...metadata,
        userAgent: navigator.userAgent,
        requesterEmail: auth.currentUser?.email || "unknown"
      },
      retryCount: 0
    };

    const docRef = await addDoc(queueRef, jobData);
    console.log(`Print job queued with ID: ${docRef.id} for printer: ${printerId}`);
    return docRef.id;
  } catch (error) {
    console.error("Error queuing print job:", error);
    throw error;
  }
};

/**
 * Helper om de juiste printer ID te bepalen op basis van station
 */
export const getPrinterIdForStation = (stationId) => {
  // Mapping kan later uit database komen
  const mapping = {
    'BH18': 'BH18-ZEBRA-USB',
    'BM01': 'BM01-ZEBRA-USB'
  };
  return mapping[stationId] || 'DEFAULT-PRINTER';
};