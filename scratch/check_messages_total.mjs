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
  console.log('Total messages:', snap.size);
  const sample = [];
  let count = 0;
  snap.forEach(doc => {
    if (count < 3) {
      sample.push(doc.data());
      count++;
    }
  });
  console.log('Sample:', JSON.stringify(sample, null, 2));
  process.exit(0);
}

checkMessages().catch(console.error);
