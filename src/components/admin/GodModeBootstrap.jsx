import React, { useState } from "react";
import { db } from "../../config/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { PATHS } from "../../config/dbPaths";
import {
  ShieldAlert,
  Zap,
  CheckCircle2,
  Loader2,
  Database,
  ArrowRight,
} from "lucide-react";

/**
 * GodModeBootstrap V2.3 - Updated Target UID
 * Gebruikt nu de UID pzxPfiwQhnQdEQJcXU77ZgT2Jo32
 */
const GodModeBootstrap = () => {
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const targetUid = "pzxPfiwQhnQdEQJcXU77ZgT2Jo32";

  // Auth check
  const auth = require("../../config/firebase").auth;
  const location = window.location;
  const isAuthenticated = auth.currentUser && !location.pathname.includes("/login");

  const handleBootstrap = async () => {
    setStatus("loading");
    setError(null);
    try {
      const userRef = doc(db, ...PATHS.USERS, targetUid);
      await setDoc(
        userRef,
        {
          uid: targetUid,
          name: "Richard van Heerde",
          email: "richard@futurepipe.com",
          role: "admin",
          permissions: ["all"],
          isGodMode: true,
          activatedAt: serverTimestamp(),
          lastSync: new Date().toISOString(),
        },
        { merge: true }
      );
      setStatus("success");
      console.log("✅ God Mode record succesvol weggeschreven voor:", targetUid);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setStatus("idle");
    }
  };

  // Render niets als niet ingelogd of op login pagina
  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-white text-left">
      <div className="max-w-xl w-full bg-white/5 border border-white/10 rounded-[50px] p-12 backdrop-blur-xl animate-in zoom-in duration-500 shadow-2xl">
        {/* ...existing code... */}
        <div className="flex items-center gap-6 mb-10">
          <div className="p-5 bg-blue-600 rounded-3xl shadow-xl">
            <ShieldAlert size={40} />
          </div>
          <div>
            <h2 className="text-3xl font-black uppercase italic tracking-tighter">
              System <span className="text-blue-500">Restore</span>
            </h2>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-2">
              Nieuwe UID Activatie
            </p>
          </div>
        </div>
        {/* ...existing code... */}
        <div className="bg-black/40 border border-white/5 p-8 rounded-[35px] mb-10 space-y-4">
          <div className="flex items-center gap-2 text-blue-400 mb-2">
            <Database size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              Actief UID:
            </span>
          </div>
          <code className="text-[11px] font-mono text-emerald-400 break-all bg-black/40 p-4 rounded-xl block border border-white/5 text-center">
            {targetUid}
          </code>
        </div>
        {/* ...existing code... */}
        {status === "success" ? (
          <div className="bg-emerald-500/20 border-2 border-emerald-500/40 p-8 rounded-[35px] flex items-center gap-6 text-emerald-400 animate-in fade-in">
            <CheckCircle2 size={40} />
            <div className="text-left">
              <p className="font-black uppercase text-sm italic">
                God Mode Actief!
              </p>
              <p className="text-[10px] opacity-80 mt-1">
                Je bent nu als Master Admin geregistreerd.
              </p>
              <button
                onClick={() => (window.location.href = "/")}
                className="mt-6 flex items-center gap-2 bg-emerald-500 text-slate-900 px-6 py-2.5 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-400"
              >
                Naar de Portal <ArrowRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleBootstrap}
            disabled={status === "loading"}
            className="w-full py-7 bg-blue-600 hover:bg-blue-500 text-white rounded-[30px] font-black uppercase tracking-[0.3em] text-sm transition-all shadow-2xl flex items-center justify-center gap-4 active:scale-95"
          >
            {status === "loading" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                Database Herstellen <Zap size={20} />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default GodModeBootstrap;
