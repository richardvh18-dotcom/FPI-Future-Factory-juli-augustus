const admin = require('firebase-admin');
admin.initializeApp({
  projectId: 'future-factory-377ef'
});

async function main() {
  try {
    const db = admin.firestore();
    const query = db.collectionGroup('orders');
    const snapshot = await query.get();
    console.log(`Total orders in collectionGroup: ${snapshot.size}`);

    const rootOrders = await db.collection('future-factory/production/digital_planning').get();
    console.log(`Total root orders: ${rootOrders.size}`);
  } catch (error) {
    console.error('Error fetching document:', error);
  } finally {
    process.exit(0);
  }
}

main();
