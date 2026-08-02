const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'components', 'digitalplanning', 'MazakView.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// 1. Add imports
content = content.replace(
  `import { useOccupancyListener } from "../../hooks/useOccupancyListener";`,
  `import { useOccupancyListener } from "../../hooks/useOccupancyListener";\nimport { FreeLabelPrintModal } from "./modals/FreeLabelPrintModal";\nimport { LargeSequencePrintModal } from "./modals/LargeSequencePrintModal";`
);

// 2. Add state
content = content.replace(
  `const [showRequestNewOrderModal, setShowRequestNewOrderModal] = useState(false);`,
  `const [showRequestNewOrderModal, setShowRequestNewOrderModal] = useState(false);\n  const [showLargeSequenceModal, setShowLargeSequenceModal] = useState(false);\n  const [showFreeLabelModal, setShowFreeLabelModal] = useState(false);`
);

// 3. Rename navigation tabs
content = content.replace(
  `{activeTab === "free" && <Tag size={18} />}
                <span className="font-black uppercase tracking-widest">{t("mazak.nav_free_label", "Vrij Label")}</span>`,
  `{activeTab === "free" && <Tag size={18} />}
                <span className="font-black uppercase tracking-widest">{t("mazak.nav_labels", "Labels")}</span>`
);
content = content.replace(
  `? t("mazak.free_label_tab_title", "Vrije labels")`,
  `? t("mazak.labels_tab_title", "Labels")`
);
content = content.replace(
  `? t("mazak.no_items_free_label", "Gebruik de vrije-label tab rechts om direct te printen")`,
  `? t("mazak.no_items_free_label", "Selecteer hiernaast het type label dat u wilt printen")`
);

// 4. Update the free tab left menu
const leftMenuOld = `) : activeTab === "free" ? (
                <div className="space-y-3">
                  {savedFreeLabelTemplates.length === 0 ? (
                    <div className="p-6 bg-slate-50 rounded-[24px] border border-slate-200 text-center">
                      <Tag size={28} className="mx-auto mb-3 text-blue-500" />
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">
                        {t("mazak.free_label_template_empty", "Nog geen vrije-label templates opgeslagen")}
                      </p>
                    </div>
                  ) : (
                    savedFreeLabelTemplates.map((template) => (
                      <div
                        key={template.id}
                        onClick={() => handleApplyFreeLabelTemplate(template)}
                        className={\`bg-white border-2 rounded-[20px] p-4 shadow-sm transition-all cursor-pointer \${selectedFreeTemplateId === template.id ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-100 hover:border-blue-200"} \`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-800 uppercase tracking-wider truncate">{template.name}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                              {template.align} • {template.fontSize} pt • {template.quantity}x
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFreeLabelTemplate(template.id);
                            }}
                            className="p-2 rounded-lg border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 transition-all"
                            title={t("common.delete", "Verwijderen")}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <p className="text-xs text-slate-600 mt-3 line-clamp-3 whitespace-pre-wrap">{template.text}</p>
                      </div>
                    ))
                  )}
                </div>`;

const leftMenuNew = `) : activeTab === "free" ? (
                <div className="space-y-4">
                  <div className="p-6 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col gap-4">
                    <h3 className="text-sm font-black uppercase italic text-slate-800">{t("mazak.labels_tab_title", "Labels")}</h3>
                    <p className="text-xs font-bold text-slate-500 mb-2">Kies het gewenste label type in het hoofdscherm om af te drukken.</p>
                  </div>
                </div>`;
content = content.replace(leftMenuOld, leftMenuNew);

// 5. Update the main rendering of activeTab === "free"
const mainAreaRegex = /\{\s*activeTab === "free" \? \([\s\S]*?\) : activeTab === "adjust" \?/g;
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
        ) : activeTab === "adjust" ?`;
content = content.replace(mainAreaRegex, mainAreaNew);

// 6. Add modals at the bottom
content = content.replace(
  `{showAdjustOrderModal && (`,
  `{showFreeLabelModal && (
        <FreeLabelPrintModal
          onClose={() => setShowFreeLabelModal(false)}
          printing={printing}
          savingFreeTemplate={savingFreeTemplate}
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
      {showAdjustOrderModal && (`
);

// 7. Replace the old handlePrintFreeLabels and handleSaveFreeLabelTemplate with new ones
// I will just replace the WHOLE block from handleSaveFreeLabelTemplate to handlePrintLabels (exclusive).
const blockRegex = /const handleSaveFreeLabelTemplate[\s\S]*?(?=const handlePrintLabels)/;
const newHandlers = `const handleSaveFreeLabelTemplate = async (templateName: string, text: string, align: "left"|"center"|"right", fontSize: number, quantity: number) => {
    const normalizedName = templateName.trim();
    if (!normalizedName) return;
    
    setSavingFreeTemplate(true);
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
      setSavingFreeTemplate(false);
    }
  };

  const handlePrintEmptyLabel = async () => {
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

  `;
content = content.replace(blockRegex, newHandlers);

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Update complete.');
