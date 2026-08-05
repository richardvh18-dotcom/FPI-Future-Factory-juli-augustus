import admin from "firebase-admin";

try {
  admin.initializeApp();
} catch (e) {
  console.log("Could not init admin:", e.message);
  process.exit(1);
}

const db = admin.firestore();

async function updateMessages() {
  const messagesRef = db.collection("future-factory/production/messages");
  const snap = await messagesRef.get();
  let count = 0;
  
  const batch = db.batch();
  snap.forEach(doc => {
    const data = doc.data();
    if ((!data.read || data.status !== "read") && data.subject && data.subject.includes("Tijdelijke Afkeur")) {
      batch.update(doc.ref, { read: true, status: "read" });
      count++;
    }
  });
  
  if (count > 0) {
    await batch.commit();
    console.log("Updated " + count + " stuck messages to read: true");
  } else {
    console.log("No unread messages found containing Tijdelijke Afkeur.");
  }
  process.exit(0);
}

updateMessages().catch(e => {
  console.error(e);
  process.exit(1);
});

