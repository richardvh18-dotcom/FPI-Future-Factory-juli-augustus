/**
 * Node.js script om Firestore-gegevens te kopiëren tussen twee Firebase-projecten.
 * 
 * Gebruik (Alleen gebruikers/personeel):
 *   node scripts/sync-users.cjs --src path/to/prod-sa.json --dest path/to/test-sa.json
 * 
 * Gebruik (De HELE database kopiëren):
 *   node scripts/sync-users.cjs --src path/to/prod-sa.json --dest path/to/test-sa.json --all
 */

const fs = require("fs");
const path = require("path");
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// Helper om argumenten te parsen
const args = process.argv.slice(2);
const srcIndex = args.indexOf("--src");
const destIndex = args.indexOf("--dest");
const copyAll = args.includes("--all");

if (srcIndex === -1 || destIndex === -1 || !args[srcIndex + 1] || !args[destIndex + 1]) {
  console.error("❌ Fout: Ongeldige argumenten.");
  console.log("\nGebruik:");
  console.log("  node scripts/sync-users.cjs --src <pad-naar-prod-sa.json> --dest <pad-naar-test-sa.json> [--all]\n");
  process.exit(1);
}

const srcSaPath = path.resolve(args[srcIndex + 1]);
const destSaPath = path.resolve(args[destIndex + 1]);

if (!fs.existsSync(srcSaPath)) {
  console.error(`❌ Bron service account bestand niet gevonden op: ${srcSaPath}`);
  process.exit(1);
}
if (!fs.existsSync(destSaPath)) {
  console.error(`❌ Bestemming service account bestand niet gevonden op: ${destSaPath}`);
  process.exit(1);
}

// Initialiseer bron-app (Productie)
const srcSa = JSON.parse(fs.readFileSync(srcSaPath, "utf8"));
const srcApp = initializeApp({
  credential: cert(srcSa),
  projectId: srcSa.project_id
}, "source-app");

// Initialiseer bestemmings-app (Test/Staging)
const destSa = JSON.parse(fs.readFileSync(destSaPath, "utf8"));
const destApp = initializeApp({
  credential: cert(destSa),
  projectId: destSa.project_id
}, "destination-app");

const srcDb = getFirestore(srcApp);
const destDb = getFirestore(destApp);

// Standaard collecties (als --all niet is meegegeven)
const BASE = "future-factory";
const DEFAULT_COLLECTIONS = [
  `${BASE}/Users/Accounts`,
  `${BASE}/Users/Personnel`,
  `${BASE}/Users/NFCTagMappings`,
  `${BASE}/Users/AccountRequests`
];

async function syncCollection(collectionRefOrPath) {
  const collectionRef = typeof collectionRefOrPath === "string"
    ? srcDb.collection(collectionRefOrPath)
    : collectionRefOrPath;
  
  const collectionPath = collectionRef.path;
  console.log(`⏳ Kopiëren van collectie: ${collectionPath}...`);
  
  // 1. Haal alle documenten op uit de bron
  const snapshot = await collectionRef.get();
  if (snapshot.empty) {
    return;
  }

  // 2. Schrijf in batches van max 500 (Firestore limiet)
  let batch = destDb.batch();
  let count = 0;
  let batchCount = 0;

  for (const doc of snapshot.docs) {
    const docRef = destDb.collection(collectionPath).doc(doc.id);
    batch.set(docRef, doc.data());
    count++;
    batchCount++;

    if (batchCount === 500) {
      await batch.commit();
      batch = destDb.batch();
      batchCount = 0;
    }

    // Als we alles kopiëren (--all), zoek dan recursief naar subcollecties in dit document
    if (copyAll) {
      try {
        const subCollections = await doc.ref.listCollections();
        for (const subCol of subCollections) {
          await syncCollection(subCol);
        }
      } catch (err) {
        console.warn(`⚠️ Kon subcollecties voor document ${doc.id} niet inlezen:`, err.message);
      }
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }
  
  console.log(`   ✅ Collectie ${collectionPath} voltooid. (${count} documenten gekopieerd)`);
}

async function run() {
  console.log("==========================================");
  console.log("🚀 START FIRESTORE SYNCHRONISATIE");
  console.log(`Bron Project:       ${srcSa.project_id}`);
  console.log(`Bestemming Project: ${destSa.project_id}`);
  console.log(`Modus:              ${copyAll ? "VOLLEDIGE DATABASE" : "ALLEEN GEBRUIKERS & PERSONEEL"}`);
  console.log("==========================================\n");

  if (srcSa.project_id === destSa.project_id) {
    console.error("❌ Fout: Bron en bestemming project ID's zijn hetzelfde! Kopiëren afgebroken.");
    process.exit(1);
  }

  try {
    if (copyAll) {
      // Haal alle root collecties op uit de bron
      const rootCollections = await srcDb.listCollections();
      if (rootCollections.length === 0) {
        console.log("ℹ️ Geen root collecties gevonden.");
      } else {
        for (const col of rootCollections) {
          await syncCollection(col);
        }
      }
    } else {
      // Kopieer alleen de standaard collecties
      for (const colPath of DEFAULT_COLLECTIONS) {
        await syncCollection(colPath);
      }
    }
    console.log("\n🎉 Synchronisatie succesvol voltooid!");
  } catch (error) {
    console.error("\n❌ Fout opgetreden tijdens de synchronisatie:", error);
  } finally {
    process.exit(0);
  }
}

run();
