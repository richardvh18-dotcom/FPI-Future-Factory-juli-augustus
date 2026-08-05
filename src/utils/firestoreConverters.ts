import { FirestoreDataConverter, QueryDocumentSnapshot, SnapshotOptions, DocumentData, WithFieldValue } from "firebase/firestore";
import { PlanningOrder, TrackedProductDoc } from "../types";

export const planningOrderConverter: FirestoreDataConverter<PlanningOrder> = {
  toFirestore(order: WithFieldValue<PlanningOrder>): DocumentData {
    // Only used when writing to Firestore, filters out undefined values naturally
    return { ...order };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): PlanningOrder {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      orderId: data.orderId || "",
      item: data.item || "",
      machine: data.machine || "",
      plan: data.plan || 0,
      ...data
    } as PlanningOrder;
  }
};

export const trackedProductConverter: FirestoreDataConverter<TrackedProductDoc> = {
  toFirestore(product: WithFieldValue<TrackedProductDoc>): DocumentData {
    return { ...product };
  },
  fromFirestore(
    snapshot: QueryDocumentSnapshot,
    options: SnapshotOptions
  ): TrackedProductDoc {
    const data = snapshot.data(options);
    return {
      id: snapshot.id,
      orderId: data.orderId || "",
      lotNumber: data.lotNumber || "",
      machine: data.machine || "",
      status: data.status || "active",
      ...data
    } as TrackedProductDoc;
  }
};
