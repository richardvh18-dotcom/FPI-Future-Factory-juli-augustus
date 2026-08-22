import { db } from "../../../config/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

export type MESEventType = 
  | "ProductionStarted"
  | "ProductionPaused"
  | "ProductionCompleted"
  | "ProductionCancelled"
  | "QualityRejected"
  | "MachineStopped"
  | "MaterialConsumed"
  | "OrderReleased"
  | "OrderTransferred";

export interface MESEvent {
  id?: string;
  type: MESEventType;
  entityId: string;
  entityType: "Order" | "Workstation" | "Machine" | "Quality" | "Batch";
  correlationId?: string; // e.g., the commandId that triggered this
  operatorId?: string;
  stationId?: string;
  payload: Record<string, any>;
  createdAt?: any;
}

export class EventStore {
  /**
   * Append an event directly to a given Firestore WriteBatch.
   */
  static appendToBatch(batch: any, event: MESEvent): void {
    const eventsRef = db.collection("events");
    const docRef = eventsRef.doc();
    
    const eventDoc = {
      ...event,
      createdAt: FieldValue.serverTimestamp(),
    };

    batch.set(docRef, eventDoc);
    
    if (event.entityId) {
      const entityRef = db.collection("eventsByEntity").doc(event.entityId).collection("history").doc(docRef.id);
      batch.set(entityRef, eventDoc);
    }

    if (event.correlationId) {
      const correlationRef = db.collection("eventsByCorrelation").doc(event.correlationId).collection("history").doc(docRef.id);
      batch.set(correlationRef, eventDoc);
    }
  }

  /**
   * Append a new event to the Event Store (creates its own batch).
   */
  static async append(event: MESEvent): Promise<string> {
    const batch = db.batch();
    EventStore.appendToBatch(batch, event);
    await batch.commit();
    
    return "appended"; // Since docRef is internal now, just return a string or refactor later if needed
  }

  /**
   * Retrieve events for a specific entity.
   */
  static async getEventsByEntity(entityId: string, limitCount = 50): Promise<MESEvent[]> {
    const snapshot = await db.collection("eventsByEntity")
      .doc(entityId)
      .collection("history")
      .orderBy("createdAt", "desc")
      .limit(limitCount)
      .get();

    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MESEvent));
  }
}

