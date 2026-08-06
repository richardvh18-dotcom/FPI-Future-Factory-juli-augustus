const admin = require('firebase-admin');
admin.initializeApp({
  projectId: 'future-factory-377ef'
});

async function main() {
  try {
    const db = admin.firestore();
    const orderId = 'N20025336_40M001834EL9AEFS0ER01M0BCCJJ0';
    
    const snapshot = await db.collection('future-factory/production/digital_planning/Fittings/tracked_items')
      .where('orderId', '==', orderId)
      .get();
      
    console.log(`Found ${snapshot.size} tracked items.`);
    
    let madeCount = 0;
    snapshot.forEach(doc => {
      const data = doc.data();
      console.log(`- ${doc.id}: status=${data.status}, station=${data.station}, createdAt=${data.createdAt}`);
      if (['completed', 'completed_with_errors', 'scrapped'].includes(data.status)) {
         madeCount++;
      }
    });
    
    console.log('Made Count calculation:', madeCount);

  } catch (error) {
    console.error('Error fetching document:', error);
  } finally {
    process.exit(0);
  }
}

main();
