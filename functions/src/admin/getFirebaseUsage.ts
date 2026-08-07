import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import monitoring from "@google-cloud/monitoring";
import { CloudCatalogClient } from "@google-cloud/billing";

// We use the default application credentials.
let metricServiceClient: any = null;
let billingClient: any = null;

/**
 * Helper to fetch a simple metric from Cloud Monitoring.
 * Note: the service account requires "Monitoring Viewer" role.
 */
async function fetchMetric(projectId: string, metricType: string, periodDays: number = 1): Promise<number> {
  if (!metricServiceClient) {
    metricServiceClient = new monitoring.MetricServiceClient();
  }
  const name = metricServiceClient.projectPath(projectId);
  
  // Create a time filter based on periodDays
  const startTime = Date.now() - periodDays * 24 * 60 * 60 * 1000;
  const request = {
    name,
    filter: `metric.type="${metricType}"`,
    interval: {
      startTime: {
        seconds: Math.floor(startTime / 1000),
      },
      endTime: {
        seconds: Math.floor(Date.now() / 1000),
      },
    },
    aggregation: {
      alignmentPeriod: { seconds: periodDays * 24 * 60 * 60 }, // alignment matches period
      perSeriesAligner: "ALIGN_SUM" as const,
      crossSeriesReducer: "REDUCE_SUM" as const,
    },
  };

  try {
    const [timeSeries] = await metricServiceClient.listTimeSeries(request);
    let total = 0;
    for (const series of timeSeries) {
      if (series.points && series.points.length > 0) {
        // Point values can be int64 or double
        const value = series.points[0].value;
        if (value?.int64Value) {
          total += Number(value.int64Value);
        } else if (value?.doubleValue) {
          total += value.doubleValue;
        }
      }
    }
    return total;
  } catch (err: any) {
    console.error(`Error fetching metric ${metricType}:`, err);
    return 0;
  }
}

/**
 * Callable function to get Firebase usage metrics and estimated costs.
 * Only administrators can access this data.
 */
export const getFirebaseUsageAndCosts = onCall({ region: "europe-west1" }, async (request) => {
  // 1. Authenticate & Authorize
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Gebruiker is niet ingelogd.");
  }

  try {
    const userDoc = await admin.firestore()
      .collection("future-factory")
      .doc("Users")
      .collection("Accounts")
      .doc(request.auth.uid)
      .get();
    if (!userDoc.exists) {
      throw new HttpsError("permission-denied", "Gebruiker niet gevonden.");
    }
    const userData = userDoc.data();
    if (userData?.role !== "admin") {
      throw new HttpsError("permission-denied", "Alleen beheerders kunnen deze data inzien.");
    }

    // 2. Determine project ID
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "fpi-future-factory-test";

    const periodDays = request.data?.periodDays || 1;

    // 3. Fetch Metrics
    // Firestore Reads
    const firestoreReads = await fetchMetric(projectId, "firestore.googleapis.com/document/read_count", periodDays);
    // Firestore Writes
    const firestoreWrites = await fetchMetric(projectId, "firestore.googleapis.com/document/write_count", periodDays);
    // Cloud Functions Invocations
    const functionInvocations = await fetchMetric(projectId, "cloudfunctions.googleapis.com/function/execution_count", periodDays);
    // Firebase Hosting requests
    const hostingRequests = await fetchMetric(projectId, "firebasehosting.googleapis.com/network/request_count", periodDays);

    // 4. Return data
    // (Actual Billing API is complex to query programmatically for real-time cost without BigQuery. 
    // We return metrics here, and in a production scenario with BigQuery export, we would run a BQ query here.)
    return {
      status: "success",
      projectId,
      timestamp: new Date().toISOString(),
      usage: {
        last24Hours: {
          firestoreReads,
          firestoreWrites,
          functionInvocations,
          hostingRequests,
        }
      },
      message: "Usage metrics fetched successfully. Note: Billing actuals require BigQuery export configured on GCP."
    };

  } catch (error: any) {
    console.error("Error in getFirebaseUsageAndCosts:", error);
    throw new HttpsError("internal", error.message || "Er is een fout opgetreden bij het ophalen van het gebruik.");
  }
});
