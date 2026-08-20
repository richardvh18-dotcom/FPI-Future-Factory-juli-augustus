// @ts-nocheck

const functions = require('firebase-functions/v1');
const auditService = require('../services/auditService');
const { z } = require('zod');

const callableDataSchema = z.record(z.string(), z.unknown());

/**
 * Higher Order Function om automatisch audit logging toe te passen op Cloud Functions callables.
 * (ISO 27001 readiness)
 *
 * @param {string} actionName - Naam van de actie (bijv. 'START_PRODUCTION')
 * @param {Function} callableFunction - De asynchrone business logica functie: (data, context) => Promise<any>
 * @param {Function} [callableBuilder] - Optionele builder voor region/runWith varianten.
 * @returns {Function} Firebase HTTPS Callable
 */
const withAudit = (actionName, callableFunction, callableBuilder = (handler) => functions.region('europe-west1').https.onCall(handler)) => {
  return callableBuilder(async (data, context) => {
    const parsedData = callableDataSchema.safeParse(data);
    if (!parsedData.success) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'De payload van deze actie moet een object zijn.',
        parsedData.error.flatten(),
      );
    }

    // 1. Log Start van de actie
    await auditService.logCallable(context, `${actionName}_STARTED`, parsedData.data, { severity: 'INFO' });

    try {
      // 2. Voer de werkelijke business logica uit
      const result = await callableFunction(parsedData.data, context);

      // 3. Log Succes (inclusief eventuele resultaten)
      await auditService.logCallable(context, `${actionName}_SUCCESS`, result || {}, { severity: 'INFO' });

      return result;
    } catch (error) {
      // 4. Log Fout
      await auditService.logCallable(context, `${actionName}_FAILED`, { error: error.message, code: error.code }, { severity: 'CRITICAL' });
      throw error;
    }
  });
};

module.exports = { withAudit };