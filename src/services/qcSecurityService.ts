import { getFunctions, httpsCallable } from "firebase/functions";
import app from "../config/firebase";

const functions = getFunctions(app);

export const saveQcMeasurement = async (payload: {
  lotNumber: string;
  resinBatch: string;
  brix?: number | null;
  tg?: number | null;
  notes?: string;
  actorLabel: string;
  source: string;
}) => {
  const callable = httpsCallable(functions, "saveQcMeasurement");
  const res = await callable(payload);
  return res.data;
};

export const saveQcInspection = async (payload: {
  lotNumber: string;
  checkType: string;
  result: "OK" | "NOK";
  note?: string;
  actorLabel: string;
  source: string;
}) => {
  const callable = httpsCallable(functions, "saveQcInspection");
  const res = await callable(payload);
  return res.data;
};