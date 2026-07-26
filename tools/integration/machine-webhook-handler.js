/**
 * Machine Event Webhook Handler for FPI Future Factory
 * (Cloud Function Endpoint / Express Handler)
 * 
 * Ontvangt IoT events van PLC's, sensoren of Node-RED (bijv. BH12 Ovendeur open event).
 * Werkt automatisch de productiestatus bij naar COMPLETED en borgt oventemperaturen.
 * 
 * Endpoint: POST https://europe-west1-fpi-future-factory.cloudfunctions.net/api/machine-events/bh12-oven-open
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Express / Cloud Function HTTP Handler
 */
exports.handleMachineEvent = async (req, res) => {
  try {
    // 1. Authenticate API Key
    const apiKey = req.headers["x-machine-api-key"] || req.query.apiKey;
    const EXPECTED_KEY = process.env.MACHINE_WEBHOOK_SECRET || "FPI_SECRET_MACHINE_KEY_2026";
    
    if (apiKey !== EXPECTED_KEY) {
      return res.status(401).json({ error: "Unauthorized: Ongeldige machine API key." });
    }

    const { machineId, eventType, lotNumber, telemetry } = req.body;

    if (!machineId || !eventType || !lotNumber) {
      return res.status(400).json({ error: "Bad Request: machineId, eventType en lotNumber zijn verplicht." });
    }

    console.log(`📡 Machine Event ontvangen: [${machineId}] ${eventType} voor Lot ${lotNumber}`);

    // 2. Zoek actieve order / lot in Firestore
    const lotRef = db.collection("tracked_products").doc(lotNumber);
    const lotDoc = await lotRef.get();

    if (!lotDoc.exists) {
      return res.status(404).json({ error: `Lot ${lotNumber} niet gevonden in actieve productie.` });
    }

    const lotData = lotDoc.data();
    const currentTemp = telemetry?.temperature || null;
    const duration = telemetry?.curingDurationMinutes || null;

    // 3. Update status als ovendeur open is (uithardfase afgerond)
    if (eventType === "OVEN_DOOR_OPENED") {
      await lotRef.update({
        step: "curing_completed",
        status: "ready_for_release",
        finishedCuringAt: admin.firestore.FieldValue.serverTimestamp(),
        "telemetry.curingTemp": currentTemp,
        "telemetry.curingMinutes": duration,
        "telemetry.ovenDoorOpenedAt": new Date().toISOString(),
      });

      // 4. Log in ISO 9001 WORM Audit Trail
      await db.collection("audit_logs").add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        action: "AUTOMATED_MACHINE_STEP_COMPLETED",
        machineId: machineId,
        lotNumber: lotNumber,
        orderId: lotData.orderId || null,
        details: {
          eventType: eventType,
          temperature: currentTemp,
          durationMinutes: duration,
          previousStep: lotData.step || "winding",
          newStep: "curing_completed",
        },
      });

      console.log(`✅ Lot ${lotNumber} op ${machineId} automatisch gereedgemeld! Temp: ${currentTemp}°C`);

      return res.status(200).json({
        success: true,
        message: `Lot ${lotNumber} automatisch bijgewerkt naar curing_completed.`,
        lotNumber: lotNumber,
        curingTemp: currentTemp,
      });
    }

    return res.status(200).json({ success: true, message: "Event ontvangen maar geen status-actie vereist." });
  } catch (error) {
    console.error("Fout in handleMachineEvent:", error);
    return res.status(500).json({ error: error.message });
  }
};
