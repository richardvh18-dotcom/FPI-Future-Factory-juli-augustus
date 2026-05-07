/**
 * Frontend error handler — vertaalt Firebase HttpsError codes naar
 * gebruiksvriendelijke Nederlandse meldingen.
 *
 * Gebruik:
 *   import { parseCallableError } from '../utils/errorHandler';
 *
 *   try { ... } catch (err) {
 *     notify(parseCallableError(err));
 *   }
 */

/** Firebase HttpsError code → standaard gebruikersbericht */
const HTTPS_CODE_MESSAGES = {
  'functions/unauthenticated':    'Je bent niet ingelogd. Log opnieuw in en probeer het opnieuw.',
  'functions/permission-denied':  'Je hebt geen rechten voor deze actie.',
  'functions/not-found':          'Het gevraagde item is niet gevonden.',
  'functions/already-exists':     'Dit item bestaat al.',
  'functions/invalid-argument':   'De ingevoerde gegevens zijn ongeldig.',
  'functions/failed-precondition':'Deze actie kan nu niet worden uitgevoerd.',
  'functions/resource-exhausted': 'Limiet bereikt. Probeer het later opnieuw.',
  'functions/internal':           'Er is een interne fout opgetreden. Probeer het opnieuw.',
  'functions/unavailable':        'De dienst is tijdelijk niet beschikbaar. Probeer het later.',
  'functions/deadline-exceeded':  'De actie duurde te lang. Probeer het opnieuw.',
  'functions/cancelled':          'De actie is geannuleerd.',
  // Firestore / Auth codes
  'permission-denied':            'Je hebt geen rechten voor deze actie.',
  'unauthenticated':              'Je bent niet ingelogd.',
  'not-found':                    'Het gevraagde item is niet gevonden.',
  'unavailable':                  'De verbinding is tijdelijk verbroken. Probeer het opnieuw.',
};

/**
 * Vertaalt een Firebase-fout naar een gebruiksvriendelijk Nederlands bericht.
 *
 * Geeft in volgorde terug:
 * 1. Het server-bericht als het er is (al in het Nederlands, meest specifiek).
 * 2. Het standaardbericht voor de bekende HttpsError code.
 * 3. Een generiek fallback bericht.
 *
 * @param {unknown} error - De gevangen fout (FirebaseError, Error, of iets anders).
 * @returns {string} Gebruiksvriendelijk bericht.
 */
export const parseCallableError = (error) => {
  if (!error) return 'Er is een onbekende fout opgetreden.';

  // Firebase HttpsError via httpsCallable: error.message bevat het server-bericht
  // error.code is bijv. 'functions/not-found'
  if (error?.code && error.code.startsWith('functions/')) {
    // Het server-bericht is al gedefinieerd in errorHandler.js (NL) — gebruik het
    if (error.message && error.message !== error.code) {
      return error.message;
    }
    return HTTPS_CODE_MESSAGES[error.code] || 'Er is een fout opgetreden bij de server-aanroep.';
  }

  // Andere bekende codes (Firestore, Auth)
  if (error?.code && HTTPS_CODE_MESSAGES[error.code]) {
    return HTTPS_CODE_MESSAGES[error.code];
  }

  // Gewone Error met bericht
  if (error?.message) {
    return error.message;
  }

  return 'Er is een onbekende fout opgetreden.';
};

/**
 * Logt een fout naar de console + geeft een gebruiksvriendelijk bericht terug.
 * Handig als je console.error + parseCallableError altijd tegelijk wil.
 *
 * @param {string} context - Naam van de operatie (voor logging).
 * @param {unknown} error - De gevangen fout.
 * @returns {string} Gebruiksvriendelijk bericht.
 */
export const logAndParseError = (context, error) => {
  console.error(`[${context}]`, error);
  return parseCallableError(error);
};
