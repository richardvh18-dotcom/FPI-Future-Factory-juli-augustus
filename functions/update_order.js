const admin = require('firebase-admin');
admin.initializeApp({
  projectId: 'future-factory-377ef'
});

async function main() {
  try {
    const db = admin.firestore();
    const docPath = 'future-factory/production/digital_planning/Fittings/machines/40BH18/orders/N20025336_40M001834EL9AEFS0ER01M0BCCJJ0';
    
    await db.doc(docPath).update({
      started_BH18: 8
    });
    
    console.log('Successfully updated started_BH18 to 8.');
  } catch (error) {
    console.error('Error updating document:', error);
  } finally {
    process.exit(0);
  }
}

main();
