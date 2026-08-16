import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";

export type ConfigItem = {
  id: string;
  value: string | number;
  label: string;
  isActive: boolean;
  order: number;
};

export type PrinterRoutingRule = {
  id: string;
  conditionType: string;
  operator: string;
  conditionValue: string;
  targetPrinter: string;
  isActive: boolean;
};

let cachedConfig: Record<string, unknown> | null = null;
let listenersActive = false;
let stopFirestoreListeners: (() => void) | null = null;

// We use a simple pub/sub to notify components of changes
const listeners = new Set<() => void>();
const notifyListeners = () => listeners.forEach((fn) => fn());

const startListeners = () => {
  if (listenersActive) return;
  listenersActive = true;
  const unsubs: Array<() => void> = [];

  cachedConfig = {
    productTypes: [],
    productLabels: [],
    connectionTypes: [],
    diameters: [],
    pressures: [],
    printerRules: [],
  };

  const collections = [
    { key: "productTypes", path: PATHS.CONFIG_PRODUCT_TYPES },
    { key: "productLabels", path: PATHS.CONFIG_PRODUCT_LABELS },
    { key: "connectionTypes", path: PATHS.CONFIG_CONNECTION_TYPES },
    { key: "diameters", path: PATHS.CONFIG_DIAMETERS },
    { key: "pressures", path: PATHS.CONFIG_PRESSURES },
  ];

  collections.forEach(({ key, path }) => {
    if (!path) return;
    const q = query(collection(db, getPathString(path)), orderBy("order", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      if (cachedConfig) {
        cachedConfig[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ConfigItem[];
        notifyListeners();
      }
    });
    unsubs.push(unsub);
  });

  const printerRulesPath = getPathString(PATHS.PRINTER_ROUTING_RULES);
  if (printerRulesPath) {
    const unsub = onSnapshot(collection(db, printerRulesPath), (snap) => {
      if (cachedConfig) {
        cachedConfig.printerRules = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PrinterRoutingRule[];
        notifyListeners();
      }
    });
    unsubs.push(unsub);
  }

  stopFirestoreListeners = () => {
    unsubs.forEach((unsub) => unsub());
    listenersActive = false;
    stopFirestoreListeners = null;
  };
};

export const useFactoryConfig = () => {
  const [config, setConfig] = useState(cachedConfig);

  useEffect(() => {
    if (!listenersActive) {
      startListeners();
    }
    
    // Initial sync
    setConfig(cachedConfig);

    const update = () => setConfig({ ...cachedConfig });
    listeners.add(update);
    return () => {
      listeners.delete(update);
      if (listeners.size === 0 && stopFirestoreListeners) {
        stopFirestoreListeners();
      }
    };
  }, []);

  // Return fallback if not yet loaded
  if (!config) {
    return {
      productTypes: [],
      productLabels: [],
      connectionTypes: [],
      diameters: [],
      pressures: [],
      printerRules: [],
      isLoading: true,
    };
  }

  return {
    ...config,
    isLoading: false,
  };
};
