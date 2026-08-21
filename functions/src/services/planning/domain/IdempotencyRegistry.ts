const { db, admin } = require('../../../config/firebase');

/**
 * Zorgt ervoor dat een commandId slechts één keer wordt uitgevoerd binnen de applicatie.
 */
class IdempotencyRegistry {
  /**
   * Werkt met een standalone transactie.
   * Controleert of de commandId al bestaat. Zo niet, schrijft het de sleutel weg.
   * Gooit 'ALREADY_PROCESSED' als het command al is uitgevoerd.
   * 
   * @param {string} commandId Unieke identifier van de client
   * @param {object} context Optionele meta-data over de executie
   * @returns {Promise<boolean>} 
   */
  static async checkAndLock(commandId, context = {}) {
    if (!commandId || typeof commandId !== 'string') {
      console.warn('IdempotencyRegistry: Geen (geldige) commandId meegegeven. Backward compatibility mode actief.');
      return true;
    }

    const lockRef = db.collection('system').doc('idempotency').collection('keys').doc(commandId);
    
    return db.runTransaction(async (tx) => {
      const lockSnap = await tx.get(lockRef);

      if (lockSnap.exists) {
        console.info(`IdempotencyRegistry: CommandId ${commandId} is al verwerkt. Actie overgeslagen.`);
        throw 'ALREADY_PROCESSED'; 
      }

      // Zet de lock
      tx.set(lockRef, {
        executedAt: admin.firestore.FieldValue.serverTimestamp(),
        context: {
          orderId: context.orderId || null,
          stationId: context.stationId || null,
          action: context.action || 'UNKNOWN_ACTION',
          uid: context.uid || null,
        }
      });

      return true;
    });
  }
}

module.exports = IdempotencyRegistry;
