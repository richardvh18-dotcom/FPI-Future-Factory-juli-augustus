const admin = require('firebase-admin');

// Ensure you run this with Google Application Default Credentials:
// export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
// node tools/sync-all-claims.js

admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();

async function syncAllClaims() {
  console.log('Starting sync of custom claims from Firestore to Auth...');
  try {
    const accountsSnapshot = await db.collection('future-factory/Users/Accounts').get();
    
    if (accountsSnapshot.empty) {
      console.log('No users found in future-factory/Users/Accounts.');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const doc of accountsSnapshot.docs) {
      const data = doc.data();
      const userId = doc.id;
      const role = data.role ? String(data.role).toLowerCase().trim() : null;

      if (!role) {
        console.log(`Skipping user ${userId}: No role found in document.`);
        continue;
      }

      try {
        const userRecord = await auth.getUser(userId);
        const currentClaims = userRecord.customClaims || {};

        await auth.setCustomUserClaims(userId, {
          ...currentClaims,
          role: role
        });
        
        console.log(`[SUCCESS] Synced role '${role}' to user ${userId} (${userRecord.email})`);
        successCount++;
      } catch (err) {
        console.error(`[ERROR] Failed to sync user ${userId}:`, err.message);
        errorCount++;
      }
    }

    console.log('\n--- Sync Complete ---');
    console.log(`Total Success: ${successCount}`);
    console.log(`Total Errors: ${errorCount}`);
    
  } catch (error) {
    console.error('Failed to run sync:', error);
  }
}

syncAllClaims();
