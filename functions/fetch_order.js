const admin = require('firebase-admin');
admin.initializeApp({
  projectId: 'future-factory-377ef'
});

async function main() {
  try {
    const db = admin.firestore();
    const docPath = 'future-factory/production/digital_planning/Fittings/machines/40BH18/orders/N20025336_40M001834EL9AEFS0ER01M0BCCJJ0';
    const doc = await db.doc(docPath).get();
    
    if (doc.exists) {
      console.log('Document Data:');
      console.log(JSON.stringify(doc.data(), null, 2));
    } else {
      console.log('No such document found at path:', docPath);
    }
  } catch (error) {
    console.error('Error fetching document:', error);
  } finally {
    process.exit(0);
  }
}

main();
