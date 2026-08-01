import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";

type OccupancyRow = Record<string, unknown> & { id: string };

let occupancyCache: OccupancyRow[] = [];
let occupancyUnsub: (() => void) | null = null;
const occupancySubscribers = new Set<(rows: OccupancyRow[]) => void>();

const notifySubscribers = () => {
  const next = [...occupancyCache];
  occupancySubscribers.forEach((cb) => cb(next));
};

const ensureGlobalListener = () => {
  if (occupancyUnsub) return;

  occupancyUnsub = onSnapshot(
    collection(db, getPathString(PATHS.OCCUPANCY)),
    (snap) => {
      occupancyCache = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as Record<string, unknown>),
      }));
      notifySubscribers();
    },
    (error) => {
      console.warn("[useOccupancyListener] Occupancy sync error:", error);
    }
  );
};

const maybeStopGlobalListener = () => {
  if (occupancySubscribers.size > 0) return;
  if (!occupancyUnsub) return;
  occupancyUnsub();
  occupancyUnsub = null;
};

export const useOccupancyListener = (enabled = true) => {
  const [rows, setRows] = useState<OccupancyRow[]>(occupancyCache);

  useEffect(() => {
    if (!enabled) {
      setRows([]);
      return;
    }

    setRows(occupancyCache);
    occupancySubscribers.add(setRows);
    ensureGlobalListener();

    return () => {
      occupancySubscribers.delete(setRows);
      maybeStopGlobalListener();
    };
  }, [enabled]);

  return rows;
};
