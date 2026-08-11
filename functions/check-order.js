const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function checkOrder() {
  const orderId = 'N20025429';
  console.log(`Checking order: ${orderId}`);
  
  // Check planning_orders (usually in specific environment collections but let's check dev/prod)
  const envPrefix = process.env.NODE_ENV === 'production' ? 'prod_' : 'dev_';
  const orderRef = db.collection('dev_planning_orders').doc(orderId);
  let orderDoc = await orderRef.get();
  if (!orderDoc.exists) {
    const prodRef = db.collection('prod_planning_orders').doc(orderId);
    orderDoc = await prodRef.get();
  }
  
  if (orderDoc.exists) {
    const data = orderDoc.data();
    console.log('Order data:');
    console.log(`Quantity: ${data.quantity}`);
    console.log(`ToDo: ${data.todo}`);
    console.log(`In Progress: ${data.inProgress}`);
    console.log(`Ready: ${data.ready}`);
    console.log(`Delivered: ${data.delivered}`);
    console.log(`Scrap: ${data.scrap}`);
    console.log(`Hold: ${data.hold}`);
    console.log(`Department Stats:`, data.departmentStats);
  } else {
    console.log('Order not found in dev or prod collections.');
  }

  // Check tracked_products
  const prodProductsRef = db.collection('prod_tracked_products');
  const prodProducts = await prodProductsRef.where('orderId', '==', orderId).get();
  console.log(`Found ${prodProducts.size} tracked products in prod.`);
  
  const devProductsRef = db.collection('dev_tracked_products');
  const devProducts = await devProductsRef.where('orderId', '==', orderId).get();
  console.log(`Found ${devProducts.size} tracked products in dev.`);
  
  // Archief?
  const devArchiveRef = db.collection('dev_tracked_products_archive');
  const devArchive = await devArchiveRef.where('orderId', '==', orderId).get();
  console.log(`Found ${devArchive.size} tracked products in dev archive.`);

  const prodArchiveRef = db.collection('prod_tracked_products_archive');
  const prodArchive = await prodArchiveRef.where('orderId', '==', orderId).get();
  console.log(`Found ${prodArchive.size} tracked products in prod archive.`);
  
  process.exit(0);
}

checkOrder().catch(console.error);
