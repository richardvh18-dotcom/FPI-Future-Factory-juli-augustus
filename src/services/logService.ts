import { auth, logActivity as logActivityCore } from "../config/firebase";

type LogLevel = "info" | "warn" | "error" | "debug";

// Helper to get or create a session ID for the current browser session
const getSessionId = () => {
  if (typeof window === "undefined") return "server-session";
  let sid = sessionStorage.getItem("iso_audit_session_id");
  if (!sid) {
    sid = `sess_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
    sessionStorage.setItem("iso_audit_session_id", sid);
  }
  return sid;
};

// Backward-compatible wrapper rond de centrale logger in firebase.jsx
export const logActivity = async (
  action: string,
  module: string,
  details: Record<string, unknown> = {},
  level: LogLevel = "info",
) => {
  try {
    const isBrowser = typeof window !== "undefined";
    
    // Extracted ISO 9001 / 27001 Audit Metadata
    const meta = {
      module,
      level,
      details,
      userAgent: isBrowser ? window.navigator.userAgent : "server",
      sessionId: getSessionId(),
      path: isBrowser ? window.location.pathname : "",
      language: isBrowser ? window.navigator.language : "",
      screenResolution: isBrowser ? `${window.screen.width}x${window.screen.height}` : "",
      impersonatorId: isBrowser ? (sessionStorage.getItem("impersonatorId") || null) : null,
      clientTimestamp: new Date().toISOString(),
    };

    await logActivityCore(
      auth.currentUser?.uid || "system",
      action,
      JSON.stringify(meta)
    );
  } catch (error) {
    console.error("Log error:", error);
  }
};