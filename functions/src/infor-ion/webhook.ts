import * as functions from 'firebase-functions';

/**
 * Webhook endpoint for Infor ION to post messages to this application.
 * You should configure an ION API Target to point to this Firebase Function URL.
 */
export const ionWebhook = functions.https.onRequest(async (req, res) => {
  try {
    // 1. Authenticate the request (e.g. check a custom API key in headers)
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.ION_WEBHOOK_SECRET) {
      res.status(401).send('Unauthorized');
      return;
    }

    // 2. Parse the incoming data (JSON or XML depending on ION mapping)
    const payload = req.body;

    console.log('Received payload from Infor ION:', JSON.stringify(payload));

    // 3. Handle specific BODs (e.g. ProductionResponse, SyncItemMaster)
    // if (payload.BODType === 'ProductionResponse') { ... }

    // 4. Respond quickly to ION to acknowledge receipt
    res.status(200).send({ status: 'Success', message: 'BOD received' });
  } catch (error) {
    console.error('Error handling ION webhook:', error);
    res.status(500).send('Internal Server Error');
  }
});
