import { create } from "zustand";
import { type Firestore } from "firebase/firestore";
import { subscribeTrackedProducts } from "../../utils/trackedProducts";

type TrackedProductDoc = Record<string, any> & { id: string };

interface ProductionDataState {
  trackedProducts: TrackedProductDoc[];
  loading: boolean;
  error: any | null;
  
  // Internals voor reference counting van de subscription
  activeSubscriptionsCount: number;
  firestoreUnsubscribe: (() => void) | null;
  
  // Actions
  subscribeToProducts: (db: Firestore) => () => void;
  setTrackedProducts: (products: TrackedProductDoc[]) => void;
  setError: (error: any) => void;
}

export const useProductionDataStore = create<ProductionDataState>((set, get) => ({
  trackedProducts: [],
  loading: true,
  error: null,
  activeSubscriptionsCount: 0,
  firestoreUnsubscribe: null,

  setTrackedProducts: (products) => set({ trackedProducts: products, loading: false }),
  setError: (error) => set({ error, loading: false }),

  subscribeToProducts: (db: Firestore) => {
    const state = get();
    const newCount = state.activeSubscriptionsCount + 1;
    
    // Als dit het eerste abonnement is, start de echte Firestore listener
    let currentUnsub = state.firestoreUnsubscribe;
    if (newCount === 1 && !currentUnsub) {
      currentUnsub = subscribeTrackedProducts({
        db,
        onData: (data) => {
          get().setTrackedProducts(data);
        },
        onError: (err) => {
          get().setError(err);
        },
      });
    }

    set({
      activeSubscriptionsCount: newCount,
      firestoreUnsubscribe: currentUnsub,
    });

    // Retourneer de specifieke unsubscribe handler voor deze component
    return () => {
      const currentState = get();
      const nextCount = Math.max(0, currentState.activeSubscriptionsCount - 1);
      
      let nextUnsub = currentState.firestoreUnsubscribe;
      // Als er geen actieve componenten meer luisteren, sluiten we de Firebase listener
      if (nextCount === 0 && currentState.firestoreUnsubscribe) {
        currentState.firestoreUnsubscribe();
        nextUnsub = null;
      }

      set({
        activeSubscriptionsCount: nextCount,
        firestoreUnsubscribe: nextUnsub,
      });
    };
  },
}));
