// @ts-nocheck
const functions = require("firebase-functions/v1");
const { Logging } = require("@google-cloud/logging");

const logging = new Logging();

exports.getOrderActivityLogs = functions.region("europe-west1").https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated.");
  }

  const { orderId } = data;
  if (!orderId || typeof orderId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Missing or invalid orderId.");
  }

  try {
    const filter = `resource.type="cloud_function" AND jsonPayload.details.orderId="${orderId.replace(/"/g, '\\"')}"`;

    const options = {
      filter: filter,
      orderBy: "timestamp desc",
      pageSize: 100,
    };

    const [entries] = await logging.getEntries(options);

    const logs = entries.map((entry) => {
      const payload = entry.data || {};
      return {
        id: entry.metadata?.insertId || Math.random().toString(36).substring(7),
        action: payload.action || "UNKNOWN",
        details: payload.details || {},
        actor: payload.userId || payload.userEmail || "system",
        timestamp: entry.metadata?.timestamp 
          ? (typeof entry.metadata.timestamp.toISOString === 'function' ? entry.metadata.timestamp.toISOString() : new Date(entry.metadata.timestamp).toISOString())
          : payload.timestamp || null,
        severity: entry.metadata?.severity || payload.severity || "INFO",
        category: payload.category || "SYSTEM",
      };
    });

    return { logs };
  } catch (error) {
    console.error("Failed to fetch order activity logs from Cloud Logging:", error);
    throw new functions.https.HttpsError("internal", "Failed to fetch activity logs.");
  }
});
