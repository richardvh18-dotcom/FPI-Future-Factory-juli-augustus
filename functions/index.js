const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

// Sample HTTP function
exports.helloWorld = functions.https.onRequest((request, response) => {
  response.send('Hello from Firebase!');
});

/**
 * Trigger: Wordt uitgevoerd zodra een document wordt verwijderd uit de Users collectie.
 * Actie: Verwijdert direct de bijbehorende gebruiker uit Firebase Authentication.
 */
exports.cleanupUserAuth = functions.firestore
  .document('future-factory/Users/Accounts/{userId}')
  .onDelete(async (snapshot, context) => {
    const { userId } = context.params;
    const userData = snapshot.data();
    const email = (userData && userData.email) || 'Onbekend';

    console.log(`🗑️ User document verwijderd voor: ${email} (${userId}). Start Auth cleanup...`);

    try {
      await admin.auth().deleteUser(userId);
      console.log(`✅ Succes: Gebruiker ${email} is volledig verwijderd uit Authentication.`);
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.log(`ℹ️ Info: Gebruiker ${email} was al verwijderd uit Authentication.`);
      } else {
        console.error(`❌ Fout bij verwijderen van ${email} uit Auth:`, error);
      }
    }
  });
