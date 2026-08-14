import { useEffect } from "react";
import { listenToAppVersion } from "../services/versionService";

const CURRENT_VERSION = (import.meta.env.VITE_APP_VERSION as string) || "0.1.158";

export default function VersionObserver() {

  useEffect(() => {
    let isDisposed = false;

    const isNewerVersion = (newVer: string, currentVer: string): boolean => {
      if (currentVer === "dev" || newVer === "dev") return false;
      const parse = (v: string) => v.split(".").map(Number);
      const [newMajor, newMinor, newPatch] = parse(newVer);
      const [currMajor, currMinor, currPatch] = parse(currentVer);
      
      if (Number.isNaN(newMajor) || Number.isNaN(currMajor)) return false;
      if (newMajor > currMajor) return true;
      if (newMajor < currMajor) return false;
      if (newMinor > currMinor) return true;
      if (newMinor < currMinor) return false;
      return newPatch > currPatch;
    };

    const triggerReloadIfNew = (newVersion: string) => {
      const trimmedNew = String(newVersion || "").trim();
      if (!trimmedNew) return;

      if (window.location.hostname === "localhost") {
        return;
      }

      if (isNewerVersion(trimmedNew, CURRENT_VERSION)) {
        console.log(
          `[VersionObserver] Nieuwe app-versie gedetecteerd: ${trimmedNew} (huidig: ${CURRENT_VERSION}). Pagina herladen...`
        );

        const reloadedForVersion = sessionStorage.getItem("ff_auto_reloaded_version");
        if (reloadedForVersion !== trimmedNew) {
          sessionStorage.setItem("ff_auto_reloaded_version", trimmedNew);
          window.location.reload();
        }
      }
    };

    // 1. Firestore realtime listener voor versie-updates
    const unsubscribeFirestore = listenToAppVersion((firestoreVersion) => {
      if (!isDisposed) {
        triggerReloadIfNew(firestoreVersion);
      }
    });

    // 2. Poll public/version.json (directe hosting deploys)
    const checkVersionJson = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data?.version) {
            triggerReloadIfNew(String(data.version));
          }
        }
      } catch {
        // Stil negeren bij netwerkproblemen of offline status
      }
    };

    // Eerste controle na 5 seconden om de baseline te bepalen
    const initialTimer = setTimeout(() => {
      checkVersionJson();
    }, 5000);

    // Periodieke poll elke 15 minuten
    const pollInterval = setInterval(checkVersionJson, 15 * 60 * 1000);

    // Controleer bij terugkeer naar de tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkVersionJson();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", checkVersionJson);

    return () => {
      isDisposed = true;
      unsubscribeFirestore();
      clearTimeout(initialTimer);
      clearInterval(pollInterval);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", checkVersionJson);
    };
  }, []);

  return null;
}
