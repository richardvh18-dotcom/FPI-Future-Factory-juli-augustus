import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../../../../config/firebase';
import { getPathString, PATHS } from '../../../../config/dbPaths';
import { subscribeTrackedProducts } from '../../../../utils/trackedProducts';
import { ProductItem, PlanningOrder, LabelTemplate, PrinterConfig, SavedFreeLabelTemplate } from '../mazak.types';

export const useMazakData = (stationId: string) => {
  const [items, setItems] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [availableLabels, setAvailableLabels] = useState<LabelTemplate[]>([]);
  const [availablePrinters, setAvailablePrinters] = useState<PrinterConfig[]>([]);
  const [savedFreeLabelTemplates, setSavedFreeLabelTemplates] = useState<SavedFreeLabelTemplate[]>([]);
  const [planningOrders, setPlanningOrders] = useState<PlanningOrder[]>([]);

  useEffect(() => {
    if (!stationId) return;
    const unsub = subscribeTrackedProducts({
      db,
      stations: ["MAZAK", "STATION MAZAK", "MAZAK1", "MAZAK2", "MAZAK 1", "MAZAK 2"],
      onData: (fetched) => {
        setItems(fetched as ProductItem[]);
        setLoading(false);
      }
    });
    return () => unsub();
  }, [stationId]);

  useEffect(() => {
    let unsubs: (() => void)[] = [];

    const fetchConfigs = async () => {
      try {
        const labelsRef = collection(db, getPathString(PATHS.LABELS));
        const labelsSnap = await getDocs(query(labelsRef, where('active', '==', true)));
        const labels = labelsSnap.docs.map(d => ({ id: d.id, ...d.data() } as LabelTemplate));
        setAvailableLabels(labels);

        const printersRef = collection(db, getPathString(PATHS.PRINTERS));
        const printersSnap = await getDocs(query(printersRef, where('active', '==', true)));
        const printers = printersSnap.docs.map(d => ({ id: d.id, ...d.data() } as PrinterConfig));
        setAvailablePrinters(printers);
      } catch (err) {
        console.error('Error fetching configs:', err);
      }
    };
    fetchConfigs();

    const freeRef = collection(db, getPathString(PATHS.LABEL_TEMPLATES));
    const unsubFree = onSnapshot(freeRef, (snap) => {
      const templates = snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedFreeLabelTemplate));
      setSavedFreeLabelTemplates(templates);
    });
    unsubs.push(unsubFree);

    const planningRef = collection(db, getPathString(PATHS.PLANNING));
    const unsubPlanning = onSnapshot(query(planningRef, where('status', 'in', ['pending', 'in-progress'])), (snap) => {
      const orders = snap.docs.map(d => ({ id: d.id, ...d.data() } as PlanningOrder));
      setPlanningOrders(orders);
    });
    unsubs.push(unsubPlanning);

    return () => {
      unsubs.forEach(u => u());
    };
  }, []);

  return {
    items, setItems,
    loading, setLoading,
    availableLabels,
    availablePrinters,
    savedFreeLabelTemplates, setSavedFreeLabelTemplates,
    planningOrders, setPlanningOrders
  };
};
