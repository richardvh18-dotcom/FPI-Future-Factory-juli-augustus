import admin from 'firebase-admin';

// Initialize the app with default credentials if they exist in environment or try without
try {
  admin.initializeApp();
} catch (e) {
  // Try to use a service account key if available, otherwise this won't work
  console.log("Could not init admin:", e.message);
  process.exit(1);
}

const db = admin.firestore();

async function checkMessages() {
  const messagesRef = db.collection('future-factory/production/messages');
  const snap = await messagesRef.get();
  const msgs = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (!data.read || data.status !== 'read') {
      msgs.push({ id: doc.id, to: data.to, targetGroup: data.targetGroup, subject: data.subject, read: data.read, status: data.status });
    }
  });
  console.log('Unread messages:', JSON.stringify(msgs, null, 2));
  process.exit(0);
}

checkMessages().catch(e => {
  console.error(e);
  process.exit(1);
});
