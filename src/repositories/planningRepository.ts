/**
 * planningRepository.js
 *
 * Centraliseert alle Firestore-leesbewerkingen voor de planning.
 * Hooks mogen ALLEEN via dit bestand planning-data ophalen.
 *
 * Schrijfbewerkingen gaan altijd via Cloud Functions —
 * zie src/services/planningSecurityService.js.
 */

import {
  collection,
  query,
  orderBy,
  limit,
  where,
  getDocs,
  getDoc,
  doc,
  onSnapshot,
  type QueryDocumentSnapshot,
  type DocumentData,
  type WhereFilterOp,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { PATHS, getPathString } from '../config/dbPaths';
import { planningOrderConverter } from '../utils/firestoreConverters';
import { PlanningOrder } from '../types';

type RepoDoc = QueryDocumentSnapshot<PlanningOrder>;
type SnapshotCallback = (docs: RepoDoc[]) => void;
type ErrorCallback = (err: Error) => void;

/** Maximale hoeveelheid planningorders uit env, met fallback. */
const planningLimit = () =>
  Math.max(10, Number(import.meta.env.VITE_PLANNING_LIMIT || 50));

/**
 * Schrijft je in op realtime updates van de planningcollectie.
 * Geeft een Firestore-unsubscribe-functie terug.
 *
 * @param {(docs: import('firebase/firestore').QueryDocumentSnapshot[]) => void} onData
 * @param {(err: Error) => void} onError
 * @returns {() => void} unsubscribe
 */
export const subscribePlanningOrders = (onData: SnapshotCallback, onError: ErrorCallback) => {
  const q = query(
    collection(db, getPathString(PATHS.PLANNING)).withConverter(planningOrderConverter),
    orderBy('deliveryDate', 'asc'),
    limit(planningLimit()),
  );
  return onSnapshot(q, (snap) => onData(snap.docs), onError);
};

/**
 * Eenmalige fetch van één planningorder op document-ID.
 *
 * @param {string} orderId  Firestore document-ID
 * @returns {Promise<{id: string, Record<string, unknown>} | null>}
 */
export const fetchPlanningOrder = async (orderId: string): Promise<PlanningOrder | null> => {
  const snap = await getDoc(doc(db, getPathString([...PATHS.PLANNING, orderId])).withConverter(planningOrderConverter));
  return snap.exists() ? snap.data() : null;
};

/**
 * Eenmalige fetch van planningorders gefilterd op een veld.
 *
 * @param {string} field     Veldnaam om op te filteren
 * @param {'=='|'!='|'<'|'<='|'>'|'>='} op  Operator
 * @param {*}      value     Filterwaarde
 * @returns {Promise<Array<{id: string, Record<string, unknown>}>>}
 */
export const fetchPlanningOrdersWhere = async (
  field: string,
  op: WhereFilterOp,
  value: unknown,
): Promise<PlanningOrder[]> => {
  const q = query(
    collection(db, getPathString(PATHS.PLANNING)).withConverter(planningOrderConverter),
    where(field, op, value),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data());
};

/**
 * Schrijft je in op realtime berichten voor een specifieke ontvanger.
 *
 * @param {string} recipientEmail
 * @param {(docs: import('firebase/firestore').QueryDocumentSnapshot[]) => void} onData
 * @param {(err: Error) => void} onError
 * @returns {() => void} unsubscribe
 */
export const subscribeMessages = (
  recipientEmail: string,
  onData: (docs: QueryDocumentSnapshot<DocumentData>[]) => void,
  onError: ErrorCallback,
) => {
  const q = query(
    collection(db, getPathString(PATHS.MESSAGES)),
    where('to', '==', recipientEmail.toLowerCase()),
    limit(100),
  );
  return onSnapshot(q, (snap) => onData(snap.docs), onError);
};
