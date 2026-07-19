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

let cachedConfig: any = null;
let listenersActive = false;

// We use a simple pub/sub to notify components of changes
const listeners = new Set<() => void>();
const notifyListeners = () => listeners.forEach((fn) => fn());

const startListeners = () => {
  if (listenersActive) return;
  listenersActive = true;

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
    onSnapshot(q, (snap) => {
      cachedConfig[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ConfigItem[];
      notifyListeners();
    });
  });

  const printerRulesPath = getPathString(PATHS.PRINTER_ROUTING_RULES);
  if (printerRulesPath) {
    onSnapshot(collection(db, printerRulesPath), (snap) => {
      cachedConfig.printerRules = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PrinterRoutingRule[];
      notifyListeners();
    });
  }
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
