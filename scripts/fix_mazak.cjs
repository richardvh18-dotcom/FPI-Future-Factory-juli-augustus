const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'components', 'digitalplanning', 'MazakView.tsx');
let content = fs.readFileSync(filePath, 'utf-8').replace(/\r\n/g, '\n');

const assertReplaced = (oldContent, newContent, step) => {
  if (oldContent === newContent) {
    console.error(`FAILED AT STEP: ${step}`);
    process.exit(1);
  }
};

// 1. Imports
let prev = content;
content = content.replace(
  `import { useOccupancyListener } from "../../hooks/useOccupancyListener";\n\nconst QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";`,
  `import { useOccupancyListener } from "../../hooks/useOccupancyListener";\nimport { FreeLabelPrintModal } from "./modals/FreeLabelPrintModal";\nimport { LargeSequencePrintModal } from "./modals/LargeSequencePrintModal";\n\nconst QR_CODE_OK_CONFIRMATION = "FPI-ACTION-APPROVE-OK";`
);
assertReplaced(prev, content, 'imports');

// 2. State
prev = content;
content = content.replace(
  `  const [adjustSubmitting, setAdjustSubmitting] = useState(false);\n  const activeScanInput = activeTab === "process"`,
  `  const [showLargeSequenceModal, setShowLargeSequenceModal] = useState(false);\n  const [showFreeLabelModal, setShowFreeLabelModal] = useState(false);\n  const [adjustSubmitting, setAdjustSubmitting] = useState(false);\n  const activeScanInput = activeTab === "process"`
);
assertReplaced(prev, content, 'state');

// 3. Handlers
prev = content;
const handlersBlockStart = `  const handlePrintFreeLabels = async () => {`;
const handlersBlockEnd = `  const handleDeleteFreeLabelTemplate = async (templateId: string) => {\n    const nextList = savedFreeLabelTemplates.filter((tpl) => tpl.id !== templateId);\n    try {\n      await setDoc(\n        doc(db, getPathString(PATHS.GENERAL_SETTINGS)),\n        { mazakFreeLabelTemplates: nextList },\n        { merge: true }\n      );\n      if (selectedFreeTemplateId === templateId) {\n        setSelectedFreeTemplateId("");\n      }\n      notify(t("mazak.free_label_template_deleted", "Vrij-label template verwijderd."));\n    } catch (err) {\n      console.error("Fout bij verwijderen vrije-label template:", err);\n      notify(t("mazak.free_label_template_delete_error", "Verwijderen van template is mislukt."));\n    }\n  };`;

const blockRegex = /  const handlePrintFreeLabels = async \(\) => \{[\s\S]*?  const handleDeleteFreeLabelTemplate = async \(templateId: string\) => \{[\s\S]*?    \}\n  \};/;

const newHandlers = `  const handlePrintEmptyLabel = async () => {
    setPrinting(true);
    try {
      const queuePrinter = await resolveQueuePrinterForPrint();
      const queuePrinterId = String(queuePrinter?.id || "").trim();
      const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
      if (!queuePrinterId) {
        throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
      }

      await queuePrintJob(
        queuePrinterId,
        "~JK\\n^XA\\n^XZ",
        {
          description: "Leeg Label",
          machineId: queueStationId,
          stationId: queueStationId,
          targetStation: queueStationId,
          targetPrinterName: queuePrinter?.name || queueStationId,
          queuedAsBatch: true
        }
      );
      notify(t("mazak.empty_label_printed", "Leeg label wordt geprint."));
    } catch (err: any) {
      console.error(err);
      notify(err.message || t("mazak.print_failed", "Printen mislukt."));
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintLargeSequence = async (station: string, week: string, startLot: string, quantity: number, incremental: boolean) => {
    setPrinting(true);
    try {
      const queuePrinter = await resolveQueuePrinterForPrint();
      const queuePrinterId = String(queuePrinter?.id || "").trim();
      const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
      if (!queuePrinterId) {
        throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
      }

      const template: LabelTemplate = {
        id: "LARGE-SEQUENCE-100x25",
        name: "Grote Volgnummers 100x25",
        width: 100,
        height: 25,
        elements: [
          { type: "qr", x: 2, y: 3, size: 15, content: "{lotNumber}" },
          { type: "text", x: 19, y: 7, width: 80, height: 18, fontSize: 40, isBold: true, content: "{lotNumber}", maxLines: 1 }
        ]
      };

      const zplChunks: string[] = [];
      let currentSequence = BigInt(startLot);
      for (let i = 0; i < quantity; i++) {
        const lotNumberToPrint = incremental ? (currentSequence + BigInt(i)).toString().padStart(15, "0") : startLot;
        const zplCode = await renderLabelToBitmapZpl({
          template,
          data: { lotNumber: lotNumberToPrint },
          printerDpi: mazakPrinterDpi,
          darkness: 15,
          printSpeed: 3,
          widthMm: 100,
          heightMm: 25
        });
        const isLastInBatch = i === quantity - 1;
        zplChunks.push(applyBatchCutMode(zplCode, isLastInBatch, 1));
      }

      const batchPayload = zplChunks.join("\\n");
      await queuePrintJob(
        queuePrinterId,
        batchPayload,
        {
          description: \`Grote volgnummers (\${quantity}x)\`,
          templateId: template.id,
          templateName: template.name,
          machineId: queueStationId,
          stationId: queueStationId,
          targetStation: queueStationId,
          targetPrinterName: queuePrinter?.name || queueStationId,
          labelCount: quantity,
          quantity: 1,
          queuedAsBatch: true
        }
      );

      notify(t("mazak.large_sequence_printed", "Grote volgnummers succesvol in de wachtrij geplaatst."));
      setShowLargeSequenceModal(false);
    } catch (err: any) {
      console.error(err);
      notify(err.message || t("mazak.print_failed", "Printen mislukt."));
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintFreeLabels = async (templateName: string, text: string, align: "left"|"center"|"right", fontSize: number, quantity: number) => {
    const normalizedFreeText = text.trim();
    const qty = Math.max(1, Math.min(50, Number(quantity) || 1));
    const normalizedFontSize = clampFreeLabelFontSize(fontSize);

    if (!normalizedFreeText) {
      notify(t("mazak.free_label_text_required", "Vul eerst vrije tekst in."));
      return;
    }

    setPrinting(true);
    try {
      const queuePrinter = await resolveQueuePrinterForPrint();
      const queuePrinterId = String(queuePrinter?.id || "").trim();
      const queueStationId = normalizeMachine(stationId || "MAZAK") || "MAZAK";
      if (!queuePrinterId) {
        throw new Error("Geen geldige Mazak-printer geconfigureerd voor de queue.");
      }

      const zplCode = await renderLabelToBitmapZpl({
        template: FREE_TEXT_LABEL_TEMPLATE,
        data: { text: normalizedFreeText },
        printerDpi: mazakPrinterDpi,
        darkness: 15,
        printSpeed: 3,
        widthMm: 100,
        heightMm: 25,
        fontOverrides: {
          text: {
            size: normalizedFontSize,
            align: align,
          },
        },
      });

      await queuePrintJob(
        queuePrinterId,
        applyBatchCutMode(zplCode, true, qty),
        {
          description: \`Vrij label (\${qty}x)\`,
          templateId: FREE_TEXT_LABEL_TEMPLATE.id,
          templateName: FREE_TEXT_LABEL_TEMPLATE.name,
          machineId: queueStationId,
          stationId: queueStationId,
          targetStation: queueStationId,
          targetPrinterName: queuePrinter?.name || queueStationId,
          labelCount: qty,
          quantity: 1,
          queuedAsBatch: true
        }
      );
      notify(t("mazak.free_labels_queued", "{{count}} vrije labels in wachtrij geplaatst.", { count: qty }));
      setShowFreeLabelModal(false);
    } catch (err) {
      console.error("Fout bij printen vrije labels:", err);
      const message = err instanceof Error ? err.message : String(err || "Onbekende fout");
      notify(\`\${t("mazak.print_error", "Er is een fout opgetreden bij het printen.")}: \${message}\`);
    } finally {
      setPrinting(false);
    }
  };

  const handleSaveFreeLabelTemplate = async (templateName: string, text: string, align: "left"|"center"|"right", fontSize: number, quantity: number) => {
    const normalizedName = templateName.trim();
    if (!normalizedName) return;
    
    // Use an existing state or standard react logic if setSavingFreeTemplate is gone
    setPrinting(true);
    try {
      const docRef = doc(collection(db, "freeLabelTemplates"));
      await setDoc(docRef, {
        id: docRef.id,
        name: normalizedName,
        text,
        align,
        fontSize,
        quantity,
        createdAt: new Date(),
        updatedAt: new Date(),
        stationId: stationId || "MAZAK",
      });
      notify(t("mazak.free_label_template_saved", "Template opgeslagen!"));
    } catch (err) {
      console.error(err);
      notify(t("mazak.free_label_template_save_failed", "Opslaan mislukt."));
    } finally {
      setPrinting(false);
    }
  };`;

content = content.replace(blockRegex, newHandlers);
assertReplaced(prev, content, 'handlers');

// 4. Tab Name
prev = content;
content = content.replace(
  `{t("mazak.nav_free_label", "Vrij Label")}`,
  `{t("mazak.nav_labels", "Labels")}`
);
assertReplaced(prev, content, 'tab_name');

// 5. Left Panel Placeholder
prev = content;
content = content.replace(
  `t("mazak.no_items_free_label", "Gebruik de vrije-label tab rechts om direct te printen")`,
  `t("mazak.no_items_free_label", "Selecteer hiernaast het type label dat u wilt printen")`
);
assertReplaced(prev, content, 'left_placeholder');

// 6. Labels Tab Title
prev = content;
content = content.replace(
  `{t("mazak.free_label_tab_title", "Vrije labels")}`,
  `{t("mazak.labels_tab_title", "Labels")}`
);
assertReplaced(prev, content, 'labels_tab_title');

// 7. Left Panel Main Placeholder
prev = content;
const leftPanelEmptyRegex = /\) \: activeTab === "free" \? \([\s\S]*?            \) \: \(\n              processItems\.map/m;
content = content.replace(leftPanelEmptyRegex, `) : activeTab === "free" ? (
              <div className="space-y-4">
                <div className="p-6 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4">
                  <h3 className="text-sm font-black uppercase italic text-slate-800">{t("mazak.labels_tab_title", "Labels")}</h3>
                  <p className="text-xs font-bold text-slate-500 mb-2">Kies het gewenste label type in het hoofdscherm om af te drukken.</p>
                </div>
              </div>
            ) : (
              processItems.map`);
assertReplaced(prev, content, 'left_panel_main');

// 8. Main Render Area
prev = content;
const mainAreaRegex = /\{activeTab === "free" \? \([\s\S]*?        \) \: activeTab === "adjust" \? \(/m;
const mainAreaNew = `{activeTab === "free" ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 duration-500 text-left w-full">
            <div className="bg-slate-900 rounded-[35px] p-6 text-white border-4 border-blue-500/20 relative overflow-hidden shadow-xl text-left">
              <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">{t("mazak.labels", "Labels")}</span>
              <h2 className="text-3xl font-black italic leading-none text-left">Print Opties</h2>
              <p className="text-xs font-bold text-white/70 mt-2">Kies het type label dat je wilt printen.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button
                onClick={() => setShowFreeLabelModal(true)}
                className="p-8 bg-white rounded-[2.5rem] border-2 border-slate-100 hover:border-blue-400 hover:shadow-xl transition-all flex flex-col items-center justify-center gap-4 group"
              >
                <div className="p-4 bg-blue-50 text-blue-600 rounded-3xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Tag size={40} />
                </div>
                <span className="text-lg font-black uppercase tracking-widest text-slate-800 group-hover:text-blue-700 text-center">
                  Vrij Label
                </span>
                <span className="text-xs font-bold text-slate-500 text-center">
                  Vrije tekst op een 100x25 label
                </span>
              </button>

              <button
                onClick={handlePrintEmptyLabel}
                disabled={printing}
                className="p-8 bg-white rounded-[2.5rem] border-2 border-slate-100 hover:border-slate-400 hover:shadow-xl transition-all flex flex-col items-center justify-center gap-4 group disabled:opacity-50"
              >
                <div className="p-4 bg-slate-100 text-slate-500 rounded-3xl group-hover:bg-slate-500 group-hover:text-white transition-colors">
                  <ClipboardCheck size={40} />
                </div>
                <span className="text-lg font-black uppercase tracking-widest text-slate-800 group-hover:text-slate-700 text-center">
                  Leeg Label
                </span>
                <span className="text-xs font-bold text-slate-500 text-center">
                  Voer 1 leeg 100x25 label door
                </span>
              </button>

              <button
                onClick={() => setShowLargeSequenceModal(true)}
                className="p-8 bg-white rounded-[2.5rem] border-2 border-slate-100 hover:border-indigo-400 hover:shadow-xl transition-all flex flex-col items-center justify-center gap-4 group"
              >
                <div className="p-4 bg-indigo-50 text-indigo-600 rounded-3xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Hash size={40} />
                </div>
                <span className="text-lg font-black uppercase tracking-widest text-slate-800 group-hover:text-indigo-700 text-center">
                  Grote Volgnummers
                </span>
                <span className="text-xs font-bold text-slate-500 text-center">
                  15x15 QR code + Lotnummer tekst
                </span>
              </button>
            </div>
          </div>
        ) : activeTab === "adjust" ? (`
content = content.replace(mainAreaRegex, mainAreaNew);
assertReplaced(prev, content, 'main_area');

// 9. Modals
prev = content;
content = content.replace(
  `{showAdjustOrderModal && `,
  `{showFreeLabelModal && (
        <FreeLabelPrintModal
          onClose={() => setShowFreeLabelModal(false)}
          printing={printing}
          savingFreeTemplate={false}
          onPrint={handlePrintFreeLabels}
          onSaveTemplate={handleSaveFreeLabelTemplate}
        />
      )}
      {showLargeSequenceModal && (
        <LargeSequencePrintModal
          onClose={() => setShowLargeSequenceModal(false)}
          printing={printing}
          onPrint={handlePrintLargeSequence}
        />
      )}
      {showAdjustOrderModal && `
);
assertReplaced(prev, content, 'modals');

// 10. Fix Hash import (missing from main render area)
prev = content;
content = content.replace(
  `  ClipboardCheck,\n  History,\n  ArrowLeft,`,
  `  ClipboardCheck,\n  History,\n  ArrowLeft,\n  Hash,`
);
assertReplaced(prev, content, 'import_hash');

fs.writeFileSync(filePath, content, 'utf-8');
console.log("Update complete.");

