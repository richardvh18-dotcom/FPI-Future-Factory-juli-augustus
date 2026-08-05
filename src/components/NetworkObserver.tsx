import { useEffect } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../config/firebase";
import { PATHS, getPathString } from "../config/dbPaths";

export interface NetworkObserverProps {
  userEmail?: string | null;
}

const NetworkObserver = ({ userEmail }: NetworkObserverProps) => {
  useEffect(() => {
    if (typeof window === "undefined" || !userEmail) return undefined;
    const email = String(userEmail || "").toLowerCase().trim();
    if (!email) return undefined;

    let initialized = false;

    const createConnectivityMessage = async (online: boolean) => {
      const eventKey = `connectivity:${online ? "online" : "offline"}`;
      const lastRaw = window.localStorage.getItem("ff_last_connectivity_message");
      const now = Date.now();

      if (lastRaw) {
        try {
          const last = JSON.parse(lastRaw);
          if (last?.key === eventKey && now - Number(last?.timestamp || 0) < 30000) {
            return;
          }
        } catch {
          // Ignore malformed localStorage values.
        }
      }

      await addDoc(collection(db, getPathString(PATHS.MESSAGES)), {
        to: email,
        from: "SYSTEM",
        senderId: "system-connectivity",
        subject: online ? "Verbinding hersteld" : "Offline modus actief",
        content: online
          ? "De verbinding met het netwerk is hersteld. Live synchronisatie is weer actief."
          : "De netwerkverbinding is weggevallen. De app draait verder op lokale cache totdat de verbinding terug is.",
        timestamp: serverTimestamp(),
        read: false,
        archived: false,
        priority: "normal",
        type: "system",
        targetGroup: email,
      });

      window.localStorage.setItem(
        "ff_last_connectivity_message",
        JSON.stringify({ key: eventKey, timestamp: now })
      );
    };

    const handleConnectivityChange = (online: boolean) => {
      if (!initialized) {
        initialized = true;
        return;
      }
      createConnectivityMessage(online).catch((error) => {
        console.error("Kon verbindingsmelding niet opslaan:", error);
      });
    };

    const handleOnline = () => handleConnectivityChange(true);
    const handleOffline = () => handleConnectivityChange(false);

    initialized = true;
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [userEmail]);

  return null;
};

export default NetworkObserver;
