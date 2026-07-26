/**
 * Headless Local Network Print Daemon for FPI Future Factory
 * 
 * Draait op een centrale pc of Raspberry Pi op het interne netwerk.
 * Luistert naar de Firestore 'print_queue' en stuurt ZPL-labels direct via 
 * TCP Socket (RAW poort 9100) of USB naar fysieke Zebra printers.
 * 
 * Gebruik:
 * 1. npm install firebase-admin net
 * 2. Plaats 'service-account.json' in dezelfde map
 * 3. node headless-print-daemon.js
 */

const admin = require("firebase-admin");
const net = require("net");

// Initialiseer Firebase Admin SDK
const serviceAccount = require("./service-account.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Configuratie IP-adressen / USB van netwerkprinters per routing key
const PRINTER_MAPPING = {
  "BH18": { ip: "192.168.10.201", port: 9100 },
  "MAZAK": { ip: "192.168.10.202", port: 9100 },
  "BM01": { ip: "192.168.10.203", port: 9100 },
  "DEFAULT": { ip: "192.168.10.200", port: 9100 },
};

/**
 * Verzend ZPL direct via TCP RAW socket poort 9100 naar de Zebra printer
 */
function sendZplToPrinter(ip, port, zplData) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.setTimeout(5000);

    client.connect(port, ip, () => {
      client.write(zplData, "utf-8", () => {
        client.end();
        resolve(true);
      });
    });

    client.on("error", (err) => {
      client.destroy();
      reject(err);
    });

    client.on("timeout", () => {
      client.destroy();
      reject(new Error(`Timeout bij verbinden met printer ${ip}:${port}`));
    });
  });
}

console.log("🚀 Netwerk Print Daemon gestart. Luisteren naar 'print_queue'...");

// Luister real-time naar nieuwe 'pending' opdrachten
db.collection("print_queue")
  .where("status", "==", "pending")
  .onSnapshot((snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === "added") {
        const docId = change.doc.id;
        const job = change.doc.data();
        const routingKey = String(job.routingKey || job.station || "DEFAULT").toUpperCase();
        const zpl = job.zplData || job.zpl;

        if (!zpl) {
          console.warn(`[${docId}] Geen ZPL data gevonden in printopdracht.`);
          return;
        }

        const printer = PRINTER_MAPPING[routingKey] || PRINTER_MAPPING["DEFAULT"];
        console.log(`🖨️ [${docId}] Printopdracht ontvangen voor route '${routingKey}' -> ${printer.ip}:${printer.port}`);

        try {
          // 1. Zet status op printing
          await db.collection("print_queue").doc(docId).update({
            status: "printing",
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // 2. Verstuur ZPL naar printer
          await sendZplToPrinter(printer.ip, printer.port, zpl);

          // 3. Markeer als afgerond
          await db.collection("print_queue").doc(docId).update({
            status: "completed",
            printedAt: admin.firestore.FieldValue.serverTimestamp(),
            printHost: "NET_DAEMON_HOST",
          });

          console.log(`✅ [${docId}] Succesvol afgedrukt!`);
        } catch (err) {
          console.error(`❌ [${docId}] Fout bij afdrukken naar ${printer.ip}:`, err.message);
          await db.collection("print_queue").doc(docId).update({
            status: "error",
            error: err.message,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
    });
  }, (error) => {
    console.error("Firestore luisterfout:", error);
  });
