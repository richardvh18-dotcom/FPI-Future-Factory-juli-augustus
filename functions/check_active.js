const admin = require('firebase-admin');
admin.initializeApp({
  projectId: 'future-factory-377ef'
});

async function main() {
  try {
    const db = admin.firestore();
    const orderId = 'N20025336_40M001834EL9AEFS0ER01M0BCCJJ0';
    
    // Check active products
    const snapshot1 = await db.collection('future-factory/production/digital_planning/Fittings/active_products')
      .where('orderId', '==', orderId)
      .get();
      
    console.log(`Found ${snapshot1.size} active products in active_products.`);
    snapshot1.forEach(doc => {
      console.log(`- [active_products] ${doc.id} (status: ${doc.data().status})`);
    });

    // Check tracked items that are in_progress
    const snapshot2 = await db.collection('future-factory/production/digital_planning/Fittings/tracked_items')
      .where('orderId', '==', orderId)
      .where('status', '==', 'in_progress')
      .get();
      
    console.log(`Found ${snapshot2.size} tracked items with status in_progress.`);
    snapshot2.forEach(doc => {
      console.log(`- [tracked_items] ${doc.id}`);
    });

  } catch (error) {
    console.error('Error fetching document:', error);
  } finally {
    process.exit(0);
  }
}

main();
