import React, { useState } from "react";
import { X, Save, Tag, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";

type TranslateFn = ReturnType<typeof useTranslation>["t"];

const clampFreeLabelFontSize = (val: unknown): number => {
  const n = Number(val);
  if (!Number.isFinite(n)) return 48;
  return Math.max(6, Math.min(75, n));
};

type FreeLabelPrintModalProps = {
  onClose: () => void;
  onPrint: (templateName: string, text: string, align: "left" | "center" | "right", fontSize: number, quantity: number) => Promise<void>;
  onSaveTemplate: (templateName: string, text: string, align: "left" | "center" | "right", fontSize: number, quantity: number) => Promise<void>;
  printing: boolean;
  savingFreeTemplate: boolean;
};

export const FreeLabelPrintModal = ({
  onClose,
  onPrint,
  onSaveTemplate,
  printing,
  savingFreeTemplate
}: FreeLabelPrintModalProps) => {
  const { t } = useTranslation();
  
  const [templateName, setTemplateName] = useState("");
  const [text, setText] = useState("");
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [fontSize, setFontSize] = useState<number>(48);
  const [quantity, setQuantity] = useState<number>(1);

  const handlePrint = async () => {
    if (!text.trim()) {
      toast.error(t("mazak.free_label_text_required", "Vul eerst vrije tekst in."));
      return;
    }
    await onPrint(templateName, text, align, fontSize, quantity);
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.error(t("mazak.free_label_template_name_required", "Vul een naam in voor het template."));
      return;
    }
    await onSaveTemplate(templateName, text, align, fontSize, quantity);
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-2xl rounded-[30px] shadow-2xl p-8 my-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
            <Tag className="text-blue-600" /> {t("mazak.free_label_header", "Vrij Label")}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
        </div>

        <div className="space-y-4 text-left">
          {/* Template Name & Free Text */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
              {t("mazak.free_label_template_name", "Template naam")}
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              maxLength={80}
              placeholder={t("mazak.free_label_template_name_placeholder", "Bijv. Waarschuwing rood")}
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
              {t("mazak.free_label_text", "Vrije tekst")}
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={250}
              placeholder={t("mazak.free_label_placeholder", "Typ hier de tekst voor het vrije label...")}
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500 resize-none"
            />
          </div>

          {/* Alignment */}
          <div>
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
              {t("mazak.alignment", "Uitlijning")}
            </label>
            <div className="flex gap-2">
              {(["left", "center", "right"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAlign(a)}
                  className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                    align === a
                      ? "bg-blue-500 text-white shadow-md shadow-blue-500/20"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {t(`mazak.align_${a}`, a)}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size & Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                {t("mazak.free_label_font_size", "Lettergrootte")}
              </label>
              <input
                type="number"
                min={6}
                max={75}
                value={String(fontSize)}
                onChange={(e) => setFontSize(clampFreeLabelFontSize(e.target.value))}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                {t("mazak.quantity", "Aantal")}
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={quantity}
                onChange={(e) => {
                  const parsed = Number.parseInt(String(e.target.value || "1"), 10);
                  setQuantity(Number.isFinite(parsed) ? Math.max(1, Math.min(50, parsed)) : 1);
                }}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t border-slate-100">
            <button
              onClick={handleSave}
              disabled={savingFreeTemplate || !templateName.trim() || !text.trim()}
              className="flex-1 bg-emerald-50 text-emerald-600 font-black italic p-4 rounded-2xl hover:bg-emerald-100 transition-all flex items-center justify-center gap-2 uppercase tracking-wide disabled:opacity-50"
            >
              <Save size={18} />
              {savingFreeTemplate ? t("mazak.saving", "Opslaan...") : t("mazak.save_template", "Template Opslaan")}
            </button>
            <button
              onClick={handlePrint}
              disabled={printing || !text.trim()}
              className="flex-[2] bg-blue-500 text-white font-black italic p-4 rounded-2xl hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/30 flex items-center justify-center gap-2 uppercase tracking-wide disabled:opacity-50"
            >
              <Printer size={18} />
              {printing ? t("mazak.printing", "Bezig met printen...") : t("mazak.print_label", "Print Label")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
