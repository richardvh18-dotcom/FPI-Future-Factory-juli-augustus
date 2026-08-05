import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

process.loadEnvFile('.env');

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkMessages() {
  const messagesRef = collection(db, 'future-factory/production/messages');
  const snap = await getDocs(messagesRef);
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

checkMessages().catch(console.error);
