const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'future-factory-377ef' });

async function main() {
  try {
    const db = admin.firestore();
    const docRef = db.doc('future-factory/production/digital_planning/Fittings/machines/40BH18/orders/N20025336_40M001834EL9AEFS0ER01M0BCCJJ0');
    const doc = await docRef.get();
    console.log(JSON.stringify(doc.data(), null, 2));
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

main();
