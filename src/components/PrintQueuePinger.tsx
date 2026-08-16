import { useEffect } from "react";
import app from "../config/firebase";

export interface PrintQueuePingerProps {
  enabled: boolean;
}

const PrintQueuePinger = ({ enabled }: PrintQueuePingerProps) => {
  useEffect(() => {
    if (!enabled) return;
    const keepAliveInterval = setInterval(() => {
      // Importeer inline of roep dynamisch de cloud function aan (zonder frontend validatie)
      import("firebase/functions").then(({ getFunctions, httpsCallable }) => {
        const ping = httpsCallable<unknown, unknown>(getFunctions(app, "europe-west1"), "queuePrintJob");
        // Keepalive voor cold starts, zonder echte printjob aan te maken.
        ping({ printerId: "PING", zplData: "PING", metadata: { source: "keepalive" } }).catch(() => {});
      });
    }, 9 * 60 * 1000); // Elke 9 minuten

    return () => clearInterval(keepAliveInterval);
  }, [enabled]);

  return null;
};

export default PrintQueuePinger;
