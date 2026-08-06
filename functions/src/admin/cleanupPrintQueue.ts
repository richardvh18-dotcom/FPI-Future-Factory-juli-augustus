import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

// Initialiseer admin als dit nog niet is gebeurd in index.js
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const CHUNK_SIZE = 500; // Maximaal aantal documenten per batch write

/**
 * Scheduled Cloud Function die dagelijks draait om 02:00.
 * Ruimt print_queue documenten op op basis van hun ouderdom en locatie:
 * - Paden met '/40BH', '/40BA' of 'MAZAK': 30 dagen bewaartermijn
 * - Overige paden: 2 dagen bewaartermijn
 */
export const scheduledPrintQueueCleanup = functions.region('europe-west1')
  .pubsub.schedule('0 2 * * *')
  .timeZone('Europe/Amsterdam')
  .onRun(async () => {
    try {
      const now = Date.now();
      const DAY_MS = 24 * 60 * 60 * 1000;
      let totalDeleted = 0;

      // Functie om batches te verwerken
      const processDocs = async (snapshot: admin.firestore.QuerySnapshot) => {
        let batch = db.batch();
        let count = 0;
        let batchPromises: Promise<void>[] = [];

        for (const doc of snapshot.docs) {
          const data = doc.data();
          const path = doc.ref.path.toUpperCase();
          
          // Bepaal aanmaakdatum (valback naar huidige tijd als onbekend)
          let createdAtMs = now;
          if (data.createdAt && typeof data.createdAt.toDate === 'function') {
            createdAtMs = data.createdAt.toDate().getTime();
          } else if (data.timestamp && typeof data.timestamp.toDate === 'function') {
            createdAtMs = data.timestamp.toDate().getTime();
          }

          const ageDays = (now - createdAtMs) / DAY_MS;

          // Alleen afgeronde opdrachten verwijderen (completed of error)
          const isCompleted = data.status === 'completed' || data.status === 'error';
          
          if (!isCompleted) {
            continue; // Sla over als deze nog pending of printing is
          }

          // Check of het een BH/BA/Mazak machine betreft via het pad
          const is30DayMachine = path.includes('/40BH') || path.includes('/40BA') || path.includes('/MAZAK') || path.includes('MAZAK');
          const maxAgeDays = is30DayMachine ? 30 : 2;

          if (ageDays > maxAgeDays) {
            batch.delete(doc.ref);
            count++;
            totalDeleted++;

            if (count >= CHUNK_SIZE) {
              batchPromises.push(batch.commit().then(() => {}));
              batch = db.batch();
              count = 0;
            }
          }
        }

        // Commit eventuele resterende documenten in de laatste batch
        if (count > 0) {
          batchPromises.push(batch.commit().then(() => {}));
        }

        await Promise.all(batchPromises);
      };

      // 1. Haal de scoped print queue items op via collectionGroup
      // Zoals de frontend ze queryt
      const scopedQuery = db.collectionGroup('items').where('_scopeType', '==', 'print_queue');
      const scopedSnapshot = await scopedQuery.get();
      await processDocs(scopedSnapshot);

      // 2. Optioneel: Haal ook items uit de originele root print_queue collectie voor de zekerheid
      // (inclusief legacy items in de root)
      const rootQuery = db.collection('future-factory/production/print_queue');
      const rootSnapshot = await rootQuery.get();
      await processDocs(rootSnapshot);

      console.log(`Print Queue Cleanup afgerond. In totaal ${totalDeleted} opdrachten verwijderd.`);
      return null;
    } catch (error) {
      console.error('Fout bij het opschonen van de print queue:', error);
      throw new Error('Print Queue Cleanup mislukt');
    }
  });
