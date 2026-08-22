const admin = require('firebase-admin');
admin.initializeApp({ projectId: "future-factory-377ef" });
const db = admin.firestore();

async function check() {
  try {
    const snap = await db.collection('future-factory/production/digital_planning/Fittings/machines/BH18/orders').limit(1).get();
    console.log("Success! Found", snap.size);
  } catch (e) {
    console.error("Failed:", e);
  }
}
check();
