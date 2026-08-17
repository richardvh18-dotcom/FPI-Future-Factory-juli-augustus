import { test, expect } from "vitest";
import admin from "firebase-admin";

test("inspect printers admin", async () => {
  console.log("=== INSPECTING PRINTERS WITH ADMIN SDK ===");
  
  if (admin.apps.length === 0) {
    admin.initializeApp({
      projectId: "future-factory-377ef"
    });
  }

  const db = admin.firestore();
  
  try {
    const printersRef = db.collection("future-factory/settings/printers");
    const snap = await printersRef.get();
    console.log(`Found ${snap.size} printers:`);
    snap.forEach(doc => {
      console.log(`ID: ${doc.id}`);
      console.log("Data:", JSON.stringify(doc.data(), null, 2));
    });
  } catch (e) {
    console.error("Error fetching printers via Admin SDK:", e);
  }

  expect(true).toBe(true);
});
