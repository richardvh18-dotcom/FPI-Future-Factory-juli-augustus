import { collection, collectionGroup, getDocs, query, limit } from "firebase/firestore";
import type { DocumentData, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString, getArchiveItemsPath } from "../config/dbPaths";
import { getISOWeek } from "date-fns";
import { fetchScopedEfficiencyHours } from "../utils/efficiencyScopedReader";

type PlanningDoc = QueryDocumentSnapshot<DocumentData>;

type PlanningRow = {
  Ordernummer: string;
  Product: string;
  Artikelcode: string;
  Machine: string;
  Week: string;
  Deadline: string;
  Status: string;
  Gepland: number;
  Gemaakt: number;
  Nog_te_maken: number;
  Prioriteit: string;
};

type ProductionRow = {
  orderId: string;
  lot: string;
  machine: string;
  item: string;
};

const toErrorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message || "Onbekende fout");
  }
  return "Onbekende fout";
};

// Status waarden die als "actief / te plannen" gelden
const ACTIVE_STATUSES = new Set([
  "planned", "active", "pending", "in_progress", "in progress",
  "released", "release", "vrijgegeven", "gepland", "open", "nieuw",
  "new", "todo", "to_do", "te_doen", "in_behandeling", "processing",
  "running", "lopend", "ingepland", "gereed_voor_productie", "productie",
  "on_hold", "delegated", "waiting", "wachtend",
]);

const isActiveStatus = (status: unknown): boolean => {
  if (!status) return true; // geen status = toon altijd
  return ACTIVE_STATUSES.has(String(status).toLowerCase().trim().replace(/[\s-]+/g, "_"));
};

const toDateSafe = (val: unknown): Date | null => {
  if (!val) return null;
  if (typeof (val as { toDate?: unknown })?.toDate === "function") {
    return (val as { toDate: () => Date }).toDate();
  }
  if (typeof (val as { toMillis?: unknown })?.toMillis === "function") {
    return new Date((val as { toMillis: () => number }).toMillis());
  }
  if (!(typeof val === "string" || typeof val === "number" || val instanceof Date)) {
    return null;
  }
  const d = new Date(val);
  return Number.isFinite(d.getTime()) ? d : null;
};

const MACHINE_CODE_TO_STATION: Record<string, string> = {
  "411": "BH11",
  "412": "BH12",
  "415": "BH15",
  "416": "BH16",
  "417": "BH17",
  "418": "BH18",
  "431": "BH31",
  "405": "BH05",
  "407": "BH07",
  "408": "BH08",
  "409": "BH09",
};

const normalizeMachineName = (value: unknown): string => {
  const v = String(value || "").toUpperCase().trim();
  if (!v) return "?";
  if (v === "BM18") return "BH18";
  if (v === "40BM18") return "40BH18";
  return v;
};

const inferMachineFromLot = (lotNumber: unknown): string => {
  const lot = String(lotNumber || "").replace(/\s+/g, "");
  // Lot-formaat uit backend: 40 + YY + WW + MMM + 40 + SEQ
  if (lot.length < 9) return "";
  const code = lot.slice(6, 9);
  return MACHINE_CODE_TO_STATION[code] || "";
};

const resolveMachine = (data: Record<string, unknown>, fallbackId = ""): string => {
  const fromFields =
    data.currentMachineId ||
    data.machineId ||
    data.movedToMachineId ||
    data.originMachine ||
    data.currentStation ||
    data.lastStation ||
    data.machine ||
    inferMachineFromLot(data.lotNumber) ||
    fallbackId;

  return normalizeMachineName(fromFields || inferMachineFromLot(data.lotNumber) || "?");
};

/**
 * Haalt de ruwe planningsdata op, geschoond en gestructureerd.
 * Bevraagt zowel het actuele als het legacy planning-pad.
 */
export const getRawPlanningData = async (limitCount = 1000): Promise<PlanningRow[]> => {
  try {
    const paths = [
      PATHS.PLANNING,
      ["future-factory", "production", "data", "digital_planning", "orders"],
    ];

    const rootQueries = paths.map((p) =>
      getDocs(query(collection(db, getPathString(p as string[])), limit(limitCount)))
        .catch((err) => { console.warn("Root planning query mislukt:", err); return { docs: [] }; })
    );

    // Haal OOK de scoped orders op via collectionGroup!
    const scopedQuery = getDocs(query(collectionGroup(db, "orders"), limit(limitCount)))
      .then((snapshot) => {
         const planningPrefix = `${getPathString(PATHS.PLANNING)}/`;
         return {
            docs: snapshot.docs.filter(d => {
               const p = d.ref.path || "";
               return p.startsWith(planningPrefix) && p.includes("/machines/") && p.includes("/orders/");
            })
         };
      })
      .catch((err) => { console.warn("Scoped planning query mislukt:", err); return { docs: [] }; });

    const snapshots = await Promise.all([...rootQueries, scopedQuery]);

    const seenIds = new Set<string>();
    const allDocs: PlanningDoc[] = [];
    snapshots.forEach((snap) => {
      snap.docs.forEach((d: any) => {
        if (!seenIds.has(d.id)) {
          seenIds.add(d.id);
          allDocs.push(d);
        }
      });
    });

    // Filter actieve orders in JS (vermijdt complexe Firestore index requirements)
    const activeDocs = allDocs.filter((d) => isActiveStatus(d.data().status));

    // Sorteer op weeknummer
    activeDocs.sort((a, b) => {
      const wA = Number(a.data().weekNumber || a.data().week) || 999;
      const wB = Number(b.data().weekNumber || b.data().week) || 999;
      return wA - wB;
    });

    return activeDocs.slice(0, limitCount).map((doc) => {
      const data = doc.data();
      const deliveryDate = toDateSafe(data.deliveryDate || data.plannedDeliveryDate);
      const weekNum = data.weekNumber || data.week ||
        (deliveryDate ? getISOWeek(deliveryDate) : "?");
      const weekYear = data.weekYear || data.year ||
        (deliveryDate ? deliveryDate.getFullYear() : new Date().getFullYear());

      return {
        Ordernummer: data.orderId || data.orderNumber || doc.id,
        Product: data.item || data.itemDescription || data.productCode || data.product || "N/A",
        Artikelcode: data.itemCode || data.extraCode || "",
        Machine: data.machine || data.machineId || "?",
        Week: `W${String(weekNum).padStart(2, "0")} ${weekYear}`,
        Deadline: deliveryDate ? deliveryDate.toLocaleDateString("nl-NL") : "?",
        Status: data.status || "?",
        Gepland: Number(data.plan || data.quantity || data.toDoQty || 0),
        Gemaakt: Number(data.produced || 0),
        Nog_te_maken: Math.max(0, Number(data.plan || data.quantity || 0) - Number(data.produced || 0)),
        Prioriteit: data.priority || "normaal",
        LNUren: Number(data.hours || data.plannedHours || data.standardTimeTotal || data.estimatedHours || 0)
      };
    });
  } catch (error) {
    console.error("Fout bij ophalen planning context:", error);
    return [];
  }
};

/**
 * Haalt vandaag gemaakte producten op uit tracked_products (status completed/gereed)
 * en uit het lopende jaar-archief.
 */
export const getTodayProductionContext = async () => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStr = todayStart.toISOString().slice(0, 10);

    // Scan tracked_products op vandaag-voltooide items
    const trackingPath = PATHS.TRACKING;
    const trackSnap = await getDocs(
      query(
        collection(db, getPathString(trackingPath as string[])),
        limit(800)
      )
    ).catch(() => ({ docs: [] }));

    const completedToday: ProductionRow[] = [];
    const activityToday: ProductionRow[] = [];
    const seenLots = new Set<string>();
    trackSnap.docs.forEach((d: PlanningDoc) => {
      const data = d.data();
      const status = String(data.status || "").toLowerCase();
      const step = String(data.currentStep || "").toLowerCase();
      const station = String(data.currentStation || "").toLowerCase();
      const isFinished =
        status.includes("finish") ||
        status.includes("gereed") ||
        status.includes("completed") ||
        step.includes("finish") ||
        step.includes("gereed") ||
        station === "gereed";

      const machine = resolveMachine(data as Record<string, unknown>, d.id);
      const lot = String(data.lotNumber || d.id);
      const updatedTs = toDateSafe(data.updatedAt || data.archivedAt || data.completedAt);
      const startTs = toDateSafe(
        data.timestamps?.station_start ||
        data.timestamps?.started ||
        data.startedAt ||
        data.startTime ||
        data.createdAt ||
        data.updatedAt
      );

      if (startTs && startTs >= todayStart) {
        activityToday.push({
          orderId: data.orderId || "?",
          lot,
          machine,
          item: data.item || data.itemDescription || "?",
        });
      }

      if (isFinished && updatedTs && updatedTs >= todayStart) {
        if (seenLots.has(String(lot))) return;
        seenLots.add(String(lot));
        completedToday.push({
          orderId: data.orderId || "?",
          lot,
          machine,
          item: data.item || data.itemDescription || "?",
        });
      }
    });

    // Scan archief van dit jaar op vandaag-gearchiveerde items
    const year = new Date().getFullYear();
    const archivePath = getArchiveItemsPath(year);
    const archSnap = await getDocs(
      query(collection(db, getPathString(archivePath as string[])), limit(500))
    ).catch(() => ({ docs: [] }));

    archSnap.docs.forEach((d: PlanningDoc) => {
      const data = d.data();
      const ts = toDateSafe(data.archivedAt || data.completedAt || data.updatedAt);
      if (ts && ts >= todayStart) {
        const lot = data.lotNumber || d.id;
        if (seenLots.has(String(lot))) return;
        seenLots.add(String(lot));
        completedToday.push({
          orderId: data.orderId || "?",
          lot,
          machine: resolveMachine(data as Record<string, unknown>, d.id),
          item: data.item || data.itemDescription || "?",
        });
      }
    });

    // Groepeer per order
    const byOrder = new Map<string, { item: string; machine: string; lots: string[] }>();
    completedToday.forEach(({ orderId, lot, machine, item }) => {
      if (!byOrder.has(orderId)) byOrder.set(orderId, { item, machine, lots: [] });
      const bucket = byOrder.get(orderId);
      if (bucket) bucket.lots.push(lot);
    });

    const completedByMachine = new Map<string, number>();
    completedToday.forEach((row) => {
      const key = row.machine || "?";
      completedByMachine.set(key, (completedByMachine.get(key) || 0) + 1);
    });

    const activityByMachine = new Map<string, number>();
    activityToday.forEach((row) => {
      const key = row.machine || "?";
      activityByMachine.set(key, (activityByMachine.get(key) || 0) + 1);
    });

    let ctx = `## PRODUCTIE VANDAAG (${todayStr}) — ${completedToday.length} stuks gereed:\n`;
    if (completedToday.length === 0) {
      ctx += "- Nog geen voltooide producten gevonden voor vandaag.\n";
    }
    if (completedByMachine.size > 0) {
      const machineSummary = Array.from(completedByMachine.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([machine, count]) => `${machine}: ${count}`)
        .join(", ");
      ctx += `- Gereed per machine: ${machineSummary}\n`;
    }
    if (activityByMachine.size > 0) {
      const activitySummary = Array.from(activityByMachine.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([machine, count]) => `${machine}: ${count}`)
        .join(", ");
      ctx += `- Activiteit vandaag (gestart/bijgewerkt) per machine: ${activitySummary}\n`;
    }
    byOrder.forEach(({ item, machine, lots }, orderId) => {
      ctx += `- Order **${orderId}** | ${item} | Machine: ${machine} → **${lots.length} stuk(s)** gereed (lots: ${lots.slice(0, 5).join(", ")}${lots.length > 5 ? " …" : ""})\n`;
    });
    return ctx;
  } catch (err) {
    console.error("Fout bij ophalen vandaag-productie:", err);
    return "";
  }
};

/**
 * Haalt de actuele planningsdata op en formatteert deze voor de AI.
 */
export const getLivePlanningContext = async () => {
  try {
    const [orders, todayCtx, efficiencyRows] = await Promise.all([
      getRawPlanningData(1000),
      getTodayProductionContext(),
      fetchScopedEfficiencyHours({ db, mode: 'active', maxDocs: 500 }).catch(() => [])
    ]);

    const efficiencyMap = new Map<string, number>();
    efficiencyRows.forEach((row: any) => {
      if (row.orderId && row.minutesPerUnit) {
        efficiencyMap.set(String(row.orderId).toUpperCase(), Number(row.minutesPerUnit));
      }
    });

    const now = new Date();
    const currentWeek = getISOWeek(now);
    const currentYear = now.getFullYear();

    let ctx = `\n\n## LIVE PLANNING DATA (${now.toLocaleDateString("nl-NL")} — Week ${currentWeek} van ${currentYear}):\n`;

    if (orders.length === 0) {
      ctx += "Geen actieve orders gevonden in de planning.\n";
    } else {
      // Create a summary by Machine and Week
      const summaryByMachineAndWeek = new Map<string, { stukken: number; uren: number }>();
      const ordersByMachineAndWeek = new Map<string, string[]>();

      orders.forEach((o) => {
        const key = `Machine: ${o.Machine} | Week: ${o.Week}`;
        const summary = summaryByMachineAndWeek.get(key) || { stukken: 0, uren: 0 };
        
        const nogTeMaken = o.Nog_te_maken;
        const normMinutes = efficiencyMap.get(String(o.Ordernummer).toUpperCase()) || 0;
        
        // Gebruik norm uit efficiencyMap indien bekend, anders fallback naar LN uren op de order
        let urenTeGaan = 0;
        if (normMinutes > 0) {
           urenTeGaan = (nogTeMaken * normMinutes) / 60;
        } else if ((o as any).LNUren > 0 && o.Gepland > 0) {
           // Bereken resterende uren op basis van percentage nog te maken
           urenTeGaan = ((o as any).LNUren / o.Gepland) * nogTeMaken;
        }
        
        summary.stukken += nogTeMaken;
        summary.uren += urenTeGaan;
        summaryByMachineAndWeek.set(key, summary);
        
        if (!ordersByMachineAndWeek.has(key)) ordersByMachineAndWeek.set(key, []);
        const achterstand = o.Gemaakt > 0 ? ` (${o.Gemaakt}/${o.Gepland} gemaakt)` : "";
        const urenLabel = urenTeGaan > 0 ? ` | Resterende uren: ${Math.round(urenTeGaan * 10) / 10}` : "";
        ordersByMachineAndWeek.get(key)!.push(`- **${o.Ordernummer}** | ${o.Product}${o.Artikelcode ? ` [${o.Artikelcode}]` : ""} | Status: ${o.Status} | Deadline: ${o.Deadline} | Te maken: ${nogTeMaken}${achterstand}${urenLabel} | Prio: ${o.Prioriteit}`);
      });

      ctx += `### SAMENVATTING (Openstaande stuks en uren per Machine & Week):\n`;
      Array.from(summaryByMachineAndWeek.entries()).sort().forEach(([key, totals]) => {
         const urenWeergave = totals.uren > 0 ? `${Math.round(totals.uren)} uur` : `(Norm onbekend)`;
         ctx += `- **${key}** -> Te maken: ${totals.stukken} stuks | Verwachte benodigde tijd: ${urenWeergave}\n`;
      });

      ctx += `\n### GEDETAILLEERDE ORDERS (Max 150 stuks getoond per groep):\n`;
      let orderCount = 0;
      for (const [key, orderList] of Array.from(ordersByMachineAndWeek.entries()).sort()) {
         if (orderCount > 150) break;
         ctx += `#### ${key}\n`;
         for (const line of orderList) {
            if (orderCount > 150) break;
            ctx += line + '\n';
            orderCount++;
         }
      }
    }

    ctx += `\n${todayCtx}`;
    return ctx;
  } catch (error) {
    console.error("Fout bij ophalen planning context:", error);
    return `CONTEXT WAARSCHUWING: Kon de live planning niet ophalen. Foutmelding: ${toErrorMessage(error)}`;
  }
};

