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

async function checkNotifications() {
  const notifRef = collection(db, 'future-factory/data/notifications');
  const snap = await getDocs(notifRef);
  const notifs = [];
  snap.forEach(doc => {
    notifs.push({ id: doc.id, ...doc.data() });
  });
  console.log('Notifications:', JSON.stringify(notifs, null, 2));
  process.exit(0);
}

checkNotifications().catch(console.error);
