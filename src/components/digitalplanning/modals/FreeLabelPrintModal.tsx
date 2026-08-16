import React, { useState } from "react";
import { X, Save, Tag, Printer, CheckCircle2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "react-hot-toast";
import AutoScaledLabelPreview from "../../printer/AutoScaledLabelPreview";

type TranslateFn = ReturnType<typeof useTranslation>["t"];

const clampFreeLabelFontSize = (val: unknown): number => {
  const n = Number(val);
  if (!Number.isFinite(n)) return 48;
  return Math.max(6, Math.min(75, n));
};

type FreeLabelPrintModalProps = {
  onClose: () => void;
  onPrint: (templateName: string, text: string, align: "left" | "center" | "right", vAlign: "top" | "center" | "bottom", fontSize: string, quantity: number) => Promise<void>;
  onSaveTemplate: (templateName: string, text: string, align: "left" | "center" | "right", vAlign: "top" | "center" | "bottom", fontSize: string, quantity: number) => Promise<void>;
  printing: boolean;
  savingFreeTemplate: boolean;
  savedTemplates?: unknown[];
  onSelectTemplate?: (tpl: any) => void;
  onDeleteTemplate?: (id: string) => void;
};

export const FreeLabelPrintModal = ({
  onClose,
  onPrint,
  onSaveTemplate,
  printing,
  savingFreeTemplate,
  savedTemplates = [],
  onSelectTemplate,
  onDeleteTemplate
}: FreeLabelPrintModalProps) => {
  const { t } = useTranslation();
  
  const [templateName, setTemplateName] = useState("");
  const [text, setText] = useState("");
  const [align, setAlign] = useState<"left" | "center" | "right">("center");
  const [vAlign, setVAlign] = useState<"top" | "center" | "bottom">("center");
  const [fontSize, setFontSize] = useState<string>("50");
  const [quantity, setQuantity] = useState<string>("1");
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");

  const handlePrint = async () => {
    if (!text.trim()) {
      toast.error(t("mazak.free_label_text_required", "Vul eerst vrije tekst in."));
      return;
    }
    await onPrint(templateName, text, align, vAlign, fontSize, parseInt(quantity, 10) || 1);
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      toast.error(t("mazak.free_label_template_name_required", "Vul een naam in voor het template."));
      return;
    }
    try {
      await onSaveTemplate(templateName, text, align, vAlign, fontSize, parseInt(quantity, 10) || 1);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (e) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const applyTemplate = async (tpl: unknown) => {
    setTemplateName(tpl.name || "");
    setText(tpl.text || "");
    setAlign(tpl.align || "center");
    setVAlign(tpl.vAlign || "center");
    setFontSize(String(tpl.fontSize || "50"));
    setQuantity(String(tpl.quantity || 1));
    
    if (onSelectTemplate) {
      onSelectTemplate(tpl);
    }

    const inputQty = window.prompt("Aantal labels om te printen:", String(tpl.quantity || 1));
    if (inputQty !== null) {
      const parsedQty = Math.max(1, parseInt(inputQty, 10) || 1);
      setQuantity(String(parsedQty));
      await onPrint(
        tpl.name || "",
        tpl.text || "",
        tpl.align || "center",
        tpl.vAlign || "center",
        String(tpl.fontSize || "50"),
        parsedQty
      );
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-[30px] shadow-2xl p-6 my-auto flex flex-col md:flex-row gap-6">
        
        {/* Left Sidebar: Saved Templates */}
        <div className="w-full md:w-1/3 flex flex-col border-b md:border-b-0 md:border-r border-slate-100 pr-0 md:pr-6 pb-6 md:pb-0">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4 flex items-center justify-between">
            {t("mazak.saved_templates", "Opgeslagen Labels")}
            <span className="bg-slate-100 text-slate-500 py-0.5 px-2 rounded-full text-[10px]">{savedTemplates?.length || 0}</span>
          </h3>
          <div className="space-y-2 overflow-y-auto max-h-[60vh] custom-scrollbar pr-2">
            {savedTemplates?.length === 0 ? (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  {t("mazak.free_label_template_empty", "Nog geen templates")}
                </p>
              </div>
            ) : (
              savedTemplates?.map((template) => (
                <div
                  key={template.id}
                  onClick={() => applyTemplate(template)}
                  className={`bg-white border-2 rounded-2xl p-3 shadow-sm transition-all cursor-pointer border-slate-100 hover:border-blue-200`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">{template.name}</p>
                      <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                        {template.align} • {template.vAlign || "center"} • {template.fontSize} pt
                      </p>
                    </div>
                    {onDeleteTemplate && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteTemplate(template.id);
                        }}
                        className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 transition-all"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-600 mt-2 line-clamp-2">{template.text}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Side: Form */}
        <div className="w-full md:w-2/3 flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-black text-slate-800 uppercase italic flex items-center gap-2">
              <Tag className="text-blue-600" /> {t("mazak.free_label_header", "Vrij Label")}
            </h3>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full"><X size={20} /></button>
          </div>

        <div className="space-y-4 text-left">
          <div className="mb-6 bg-slate-50 p-4 rounded-2xl border-2 border-slate-100 overflow-hidden flex items-center justify-center relative min-h-[120px] max-h-[120px]">
            <div className="absolute top-2 left-2 text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1 z-10">
              <Printer size={10} className="text-blue-500" /> {t("mazak.preview", "Preview")}
            </div>
            {text ? (
              <AutoScaledLabelPreview 
                label={{ 
                  id: "preview", 
                  name: "preview", 
                  text, 
                  align, 
                  vAlign, 
                  fontSize: String(fontSize) 
                } as any} 
                data={{}} 
                maxScale={1} 
              />
            ) : (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {t("mazak.free_label_preview_empty", "Typ tekst voor preview")}
              </p>
            )}
          </div>

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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                {t("mazak.alignment", "Horizontale Uitlijning")}
              </label>
              <div className="flex gap-2">
                {(["left", "center", "right"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAlign(a)}
                    className={`flex-1 py-3 px-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
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
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                {t("mazak.vAlignment", "Verticale Uitlijning")}
              </label>
              <div className="flex gap-2">
                {(["top", "center", "bottom"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setVAlign(a)}
                    className={`flex-1 py-3 px-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                      vAlign === a
                        ? "bg-blue-500 text-white shadow-md shadow-blue-500/20"
                        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                    }`}
                  >
                    {t(`mazak.valign_${a}`, a === "top" ? "Boven" : a === "center" ? "Midden" : "Onder")}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Font Size & Quantity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                {t("mazak.free_label_font_size", "Lettergrootte")}
              </label>
              <input
                type="text"
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                onBlur={() => setFontSize(String(clampFreeLabelFontSize(fontSize)))}
                className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
                {t("mazak.quantity", "Aantal")}
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                onBlur={() => {
                  const parsed = parseInt(quantity, 10);
                  setQuantity(Number.isFinite(parsed) ? String(Math.max(1, Math.min(50, parsed))) : "1");
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
              className={`flex-1 font-black italic p-4 rounded-2xl transition-all flex items-center justify-center gap-2 uppercase tracking-wide disabled:opacity-50 ${saveStatus === "success" ? "bg-emerald-500 text-white" : saveStatus === "error" ? "bg-red-500 text-white" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}
            >
              {saveStatus === "success" ? <CheckCircle2 size={18} /> : saveStatus === "error" ? <X size={18} /> : <Save size={18} />}
              {saveStatus === "success" ? t("mazak.saved", "Opgeslagen!") : saveStatus === "error" ? t("mazak.error", "Fout!") : savingFreeTemplate ? t("mazak.saving", "Opslaan...") : t("mazak.save_template", "Template Opslaan")}
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
    </div>
  );
};
