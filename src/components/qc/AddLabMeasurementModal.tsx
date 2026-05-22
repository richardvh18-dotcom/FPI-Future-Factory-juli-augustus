import React, { useState } from "react";
import { X, Save, Loader2, Beaker } from "lucide-react";
import { useTranslation } from "react-i18next";
import { saveQcMeasurement } from "../../services/qcSecurityService";
import { auth } from "../../config/firebase";
import { useNotifications } from "../../contexts/NotificationContext";

type AddLabMeasurementModalProps = {
  onClose: () => void;
  defaultType?: "brix" | "tg";
};

const AddLabMeasurementModal = ({ onClose, defaultType = "brix" }: AddLabMeasurementModalProps) => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotifications();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    lotNumber: "",
    resinBatch: "",
    brix: "",
    tg: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedBrix = formData.brix !== "" ? parseFloat(formData.brix) : null;
    const parsedTg = formData.tg !== "" ? parseFloat(formData.tg) : null;

    if (parsedBrix === null && parsedTg === null) {
      showError("Vul tenminste een Brix of Tg waarde in.");
      return;
    }

    setLoading(true);
    try {
      await saveQcMeasurement({
        lotNumber: formData.lotNumber,
        resinBatch: formData.resinBatch,
        brix: parsedBrix,
        tg: parsedTg,
        notes: formData.notes,
        actorLabel: auth.currentUser?.email || "QC Operator",
        source: "AddLabMeasurementModal"
      });
      showSuccess(t("qc.measurement_saved", "Meting succesvol opgeslagen via backend en gelogd."));
      onClose();
    } catch (err: any) {
      console.error(err);
      showError(err.message || "Fout bij opslaan van meting.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white w-full max-w-md rounded-[30px] shadow-2xl overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
              <Beaker size={24} />
            </div>
            <div>
              <h3 className="font-black text-slate-800 uppercase text-lg italic tracking-tight">Nieuwe Meting</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Lab Waarden Registratie</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X size={20} className="text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">Lotnummer</label>
            <input type="text" required value={formData.lotNumber} onChange={(e) => setFormData({ ...formData, lotNumber: e.target.value.toUpperCase() })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder="Bijv. 4026..." />
          </div>
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">Harsbatch (Resin)</label>
            <input type="text" required value={formData.resinBatch} onChange={(e) => setFormData({ ...formData, resinBatch: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder="Bijv. RES-2026-041" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">Brix</label>
              <input type="number" step="0.1" value={formData.brix} onChange={(e) => setFormData({ ...formData, brix: e.target.value })} autoFocus={defaultType === "brix"} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder="14.2" />
            </div>
            <div>
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">Tg</label>
              <input type="number" step="0.1" value={formData.tg} onChange={(e) => setFormData({ ...formData, tg: e.target.value })} autoFocus={defaultType === "tg"} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold outline-none focus:border-blue-500" placeholder="128.5" />
            </div>
          </div>
          <div>
            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 block">Notitie (Optioneel)</label>
            <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full p-3 bg-slate-50 border-2 border-slate-100 rounded-xl font-medium outline-none focus:border-blue-500 resize-none min-h-[80px]" placeholder="Opmerkingen over de test..." />
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors text-xs uppercase tracking-wider flex-1">Annuleren</button>
            <button type="submit" disabled={loading} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 flex-[2]">
              {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
              Opslaan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddLabMeasurementModal;