# 1. Projectstructuur & Architectuur

Dit document beschrijft de architectuur en ontwerppatronen van de Future Factory applicatie. Het is bedoeld om (nieuwe) ontwikkelaars snel wegwijs te maken in de codebase en de gemaakte technische keuzes toe te lichten.

## High-Level Overzicht
De applicatie is een **React Single Page Application (SPA)**, gebouwd met **Vite** en **TypeScript**.
Als backend wordt **Firebase** gebruikt:
- **Firestore** voor de NoSQL database.
- **Firebase Auth** voor authenticatie.
- **Firebase Hosting** voor deployment van de frontend.
- **Firebase Functions** voor server-side logica en integraties.

Het doel van het systeem is het digitaal aansturen van de productievloer, het afhandelen van planningen, lotnummer-generatie, en het direct printen van ZPL labels via Zebra printers.

---

## Mappenstructuur

De root van het project bevat configuratiebestanden (`package.json`, `vite.config.ts`, `firebase.json`, etc.). De broncode bevindt zich voornamelijk in de `src/` map.

- `src/components/` - Bevat alle React componenten, gegroepeerd per domein (bijv. `digitalplanning/`, `admin/`, `products/`, `printer/`).
- `src/services/` - Bestanden met zware backend-logica (bijv. `planningSecurityService.ts`, lotnummer validatie, AI Assistant services).
- `src/hooks/` - Gedeelde React hooks, waaronder Authenticatie (`useAdminAuth.ts`) en Firebase data hooks.
- `src/config/` - Firebase initialisatie (`firebase.ts`) en gecentraliseerde database paden (`dbPaths.ts`).
- `src/utils/` - Helper functies voor datumnotaties, status-checks en filtering.
- `docs/` - Systeemdocumentatie en logboeken (`CONVERSATION_SUMMARY.md`).
- `tools/` - Losse scripts voor eenmalige migraties of datamanipulatie (buiten de Vite bundel).
- `scripts/` - CI/CD en operationele scripts (zoals build verification).

---

## Belangrijkste Concepten & Lagen

### 1. UI & Orkestratie (Hubs)
De applicatie maakt gebruik van "Hubs" per specifieke machine of afdeling (bijv. `Terminal.tsx` voor wikkelstations, `BM01Hub.tsx` voor de eindinspectie).
- **Slimme Orkestrators:** Deze hubs fungeren puur als orkestrators. Ze bevatten zelf weinig tot geen bedrijfslogica.
- **Tab-Componenten:** De UI is opgedeeld in losse tab-componenten (bijv. `BM01InspectionTab.tsx`, `TerminalPlanningView.tsx`) voor maximale herbruikbaarheid en leesbaarheid.

### 2. Data Layer (Custom Hooks)
Alle interacties met Firestore (zoals `onSnapshot` listeners en queries) zijn geëxtraheerd naar gespecialiseerde data-hooks.
- **Voorbeelden:** `useTerminalData.ts`, `useBM01Data.ts`.
- **Waarom:** Dit scheidt de data-fetching van de UI, voorkomt oneindige render-loops, en zorgt ervoor dat componenten alleen herladen wanneer relevante data wijzigt.

### 3. Action Layer
Complexe acties, state-beheer voor modals en hardware-interacties leven in Action Hooks.
- **Voorbeeld:** `useTerminalActions.ts`.
- **Functie:** Bevat functies zoals `handleStartProduction`, `handleScan`, en beheert de statussen van bijbehorende modals (bijv. Release of Start Modals).

---

## Offline Tolerantie & Firestore Caching

De fabrieksvloer (vooral tablets) kan last hebben van instabiele WiFi.
- **IndexedDB Cache:** Firestore caching staat aan met een expliciete limiet van **50MB** (om browser `QuotaExceeded` crashes te voorkomen).
- **Soft Recovery:** Bij een tijdelijk verbroken verbinding laadt de app uit de cache. Er is een automatische opschoon-routine ingebouwd (`clearIndexedDb`) voor zware corrupties.

---

## Interne Netwerk Print Server (Headless Host Proxy)

Voor locaties waar USB-printers (zoals Zebra ZM400 of ZT411) aan een centrale pc of Raspberry Pi zijn gekoppeld op het interne netwerk, is het **niet verplicht** om een browser met WebUSB open te hebben staan op de client-tablets.

### 1. Architectuur van de Interne Host Daemon
```
[ Tablet / Browser UI ] ──( Cloud Firestore )──> [ print_queue ]
                                                         │
                                                  (Background Listen)
                                                         ▼
                                            [ Interne Print Host Service ]
                                            (Node.js Daemon / Raspberry Pi)
                                                         │
                                                    (Direct USB /
                                                     RAW TCP 9100)
                                                         ▼
                                              [ Fysieke Zebra Printer ]
```

- **Achtergrond Daemon:** Een lichtgewicht Node.js of Python service draait als achtergronddienst (`systemd` op Linux of `nssm` op Windows) op de pc waar de USB-printer fysiek aan hangt.
- **Firebase Admin Credentials:** De daemon authenticeert via een veilige `service-account.json` en luistert met `onSnapshot` direct naar de Firestore `print_queue` collectie.
- **Automatische Verwerking:**
  1. Zodra een tablet een printopdracht instuurt met status `pending` en een matchende `routingKey` (bijv. `BH18`, `MAZAK`, `BM01`), haalt de daemon het ZPL-etiket op.
  2. De daemon stuurt de ZPL-code rechtstreeks naar de lokale USB-poort of netwerkpoort RAW 9100 via direct spooling of socket stream.
  3. De status in Firestore wordt automatisch bijgewerkt naar `printing` en `completed`.
- **Voordeel:** Geen enkele browser of operator hoeft een WebUSB-tab open te houden. Printen werkt 100% stil en automatisch over het interne netwerk.

### 2. Code Implementatie: Netwerk Print Daemon (`tools/integration/headless-print-daemon.js`)
```javascript
const admin = require("firebase-admin");
const net = require("net");
const serviceAccount = require("./service-account.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// IP-adressen van netwerkprinters per station/routingkey
const PRINTER_MAPPING = {
  "BH18": { ip: "192.168.10.201", port: 9100 },
  "MAZAK": { ip: "192.168.10.202", port: 9100 },
  "BM01": { ip: "192.168.10.203", port: 9100 },
  "DEFAULT": { ip: "192.168.10.200", port: 9100 },
};

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
    client.on("error", (err) => { client.destroy(); reject(err); });
    client.on("timeout", () => { client.destroy(); reject(new Error(`Timeout verbinding ${ip}:${port}`)); });
  });
}

// Luister naar Firestore print_queue
db.collection("print_queue").where("status", "==", "pending").onSnapshot((snapshot) => {
  snapshot.docChanges().forEach(async (change) => {
    if (change.type === "added") {
      const docId = change.doc.id;
      const job = change.doc.data();
      const routingKey = String(job.routingKey || job.station || "DEFAULT").toUpperCase();
      const zpl = job.zplData || job.zpl;
      const printer = PRINTER_MAPPING[routingKey] || PRINTER_MAPPING["DEFAULT"];

      try {
        await db.collection("print_queue").doc(docId).update({ status: "printing" });
        await sendZplToPrinter(printer.ip, printer.port, zpl);
        await db.collection("print_queue").doc(docId).update({
          status: "completed",
          printedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ Printopdracht ${docId} afgedrukt op ${printer.ip}`);
      } catch (err) {
        await db.collection("print_queue").doc(docId).update({ status: "error", error: err.message });
      }
    }
  });
});
```

---

## Machine Data Integratie & IoT Automatisering

De Future Factory architectuur ondersteunt directe twee-richtingskoppelingen met fabrieksmachines, PLC's, oventemperaturen en wikkelrobots.

### 1. Automatische Stapafhandeling & Sensordata (Bijv. Ovendeur BH12)
- **Scenario:** Wanneer de ovendeur op uithardstation BH12 opengaat, moet de wikkel- en uithardstap automatisch gereedgemeld worden én moeten de gemeten oventemperaturen opgeslagen worden.
- **Dataflow & Werking:**
  1. **PLC / Sensor Trigger:** Een PLC (bijv. Siemens S7 / Beckhoff) of Node-RED op de machine detecteert dat de ovendeur opengaat (`door_state = OPEN`).
  2. **Temperatuur Uitlezen:** De PLC leest de actuele uithardtemperatuur (bijv. `145°C`) en de totale uithardduur.
  3. **HTTP Webhook Naar Future Factory:** De PLC / Node-RED verstuurt een geauthenticeerde HTTP POST request naar het Cloud Function endpoint.

#### Code Implementatie: Machine Webhook Handler (`tools/integration/machine-webhook-handler.js`)
```javascript
const functions = require("firebase-functions");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

exports.handleMachineEvent = async (req, res) => {
  try {
    const apiKey = req.headers["x-machine-api-key"];
    if (apiKey !== process.env.MACHINE_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { machineId, eventType, lotNumber, telemetry } = req.body;
    const lotRef = db.collection("tracked_products").doc(lotNumber);
    const lotDoc = await lotRef.get();

    if (!lotDoc.exists) return res.status(404).json({ error: "Lot niet gevonden" });

    if (eventType === "OVEN_DOOR_OPENED") {
      // 1. Update status naar gereed en sla temperatuur op
      await lotRef.update({
        step: "curing_completed",
        status: "ready_for_release",
        finishedCuringAt: admin.firestore.FieldValue.serverTimestamp(),
        "telemetry.curingTemp": telemetry?.temperature || null,
        "telemetry.curingMinutes": telemetry?.curingDurationMinutes || null,
      });

      // 2. Log in WORM Audit Trail (ISO 9001)
      await db.collection("audit_logs").add({
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        action: "AUTOMATED_MACHINE_STEP_COMPLETED",
        machineId,
        lotNumber,
        details: { eventType, temperature: telemetry?.temperature },
      });

      return res.status(200).json({ success: true, message: "Stap automatisch gereedgemeld." });
    }
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
```

### 2. Machine Programma Overdracht via FTP (Bijv. Wikkelrobot BH18)
- **Scenario:** De Wikkelrobot op BH18 moet automatisch het juiste wikkelprogramma / recept ontvangen zodra een order wordt gestart.
- **Dataflow & Werking:**
  1. **Programma Generatie:** Zodra een operator een order activeert op BH18, genereert de Future Factory backend het wikkelspecificatiebestand (`.PRG` / `.CNC` / `.DAT`).
  2. **FTP Transfer Host Service:** Een interne netwerkservice maakt via FTP/SFTP verbinding met de controller van de Wikkelrobot (`ftp://192.168.10.18/programs/`).

#### Code Implementatie: Robot FTP Transfer Service (`tools/integration/robot-ftp-transfer.js`)
```javascript
const ftp = require("basic-ftp");
const fs = require("fs");
const path = require("path");

async function uploadProgramToRobot(orderId, diameter, pressure = 16, windingAngle = 54.7) {
  const client = new ftp.Client();
  const tempFileName = `RECIPE_${orderId}.PRG`;
  const tempFilePath = path.join(__dirname, tempFileName);

  // 1. Genereer robot recept / G-code
  const programCode = `
; FPI FUTURE FACTORY RECEPT - ORDER ${orderId}
N10 G90 G21
N20 SET_MANDREL_DIA = ${diameter}
N30 SET_PRESSURE_BAR = ${pressure}
N40 SET_WINDING_ANGLE = ${windingAngle}
N50 START_WINDING_CYCLE
N60 M30
`.trim();

  fs.writeFileSync(tempFilePath, programCode, "utf-8");

  try {
    // 2. Upload via FTP naar Wikkelrobot BH18
    await client.access({ host: "192.168.10.18", port: 21, user: "robot_operator", password: "password" });
    await client.uploadFrom(tempFilePath, `/programs/${tempFileName}`);
    console.log(`✅ Wikkelprogramma ${tempFileName} geüpload naar Wikkelrobot BH18`);
  } finally {
    client.close();
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
  }
}

module.exports = { uploadProgramToRobot };
```

---

## Code Kwaliteit & Type Veiligheid

- **TypeScript:** Strikte TypeScript (inclusief checks via `npx tsc --noEmit`). Doel is zo min mogelijk `any` of `@ts-nocheck` overrides.
- **Linting:** ESLint zonder `/* eslint-disable */` escapes in de core logica (`npm run lint`).
- **Deployment Safety:** Deployments via `npm run deploy` voeren standaard `scripts/verify-build-output.cjs` uit. Dit script stopt de uitrol als de `dist/` map corrupt is, om "Firebase 404 Page Not Found" fouten voor eindgebruikers te voorkomen.
