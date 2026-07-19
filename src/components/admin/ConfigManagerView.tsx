import React, { useState } from "react";
import { collection, doc, deleteDoc, setDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { useFactoryConfig } from "../../hooks/useFactoryConfig";
import { useTranslation } from "react-i18next";
import { PATHS, getPathString } from "../../config/dbPaths";
import { Settings, Save, Trash2, Plus, ArrowRight, Loader2, Info } from "lucide-react";
import toast from "react-hot-toast";

const ConfigManagerView = () => {
  const { t } = useTranslation();
  const config = useFactoryConfig();
  const [activeTab, setActiveTab] = useState<"productTypes" | "connectionTypes" | "diameters" | "pressures" | "printerRules">("productTypes");

  const [newItemValue, setNewItemValue] = useState("");
  const [newItemLabel, setNewItemLabel] = useState("");

  const [ruleConditionType, setRuleConditionType] = useState("itemCode");
  const [ruleOperator, setRuleOperator] = useState("startsWith");
  const [ruleConditionValue, setRuleConditionValue] = useState("");
  const [ruleTargetPrinter, setRuleTargetPrinter] = useState("");

  if (config.isLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-500" /></div>;
  }

  const handleDelete = async (collectionKey: string, id: string) => {
    if (!window.confirm("Zeker weten? Dit kan niet ongedaan worden gemaakt.")) return;
    try {
      const path = getPathString(PATHS[`CONFIG_${collectionKey.toUpperCase()}` as keyof typeof PATHS] as string[]);
      if (!path) return;
      await deleteDoc(doc(db, path, id));
      toast.success("Verwijderd!");
    } catch (e: any) {
      toast.error("Fout: " + e.message);
    }
  };

  const handleAdd = async () => {
    if (activeTab === "printerRules") {
      if (!ruleConditionValue || !ruleTargetPrinter) return;
      try {
        const path = getPathString(PATHS.PRINTER_ROUTING_RULES);
        if (!path) return;
        const newId = `rule_${ruleTargetPrinter.toLowerCase()}_${Date.now()}`;
        await setDoc(doc(db, path, newId), {
          conditionType: ruleConditionType,
          operator: ruleOperator,
          conditionValue: ruleConditionValue,
          targetPrinter: ruleTargetPrinter,
          isActive: true
        });
        setRuleConditionValue("");
        setRuleTargetPrinter("");
        toast.success("Regel toegevoegd!");
      } catch (e: any) {
        toast.error("Fout: " + e.message);
      }
      return;
    }

    if (!newItemValue) return;
    try {
      const path = getPathString(PATHS[`CONFIG_${activeTab.toUpperCase()}` as keyof typeof PATHS] as string[]);
      if (!path) return;
      const newId = newItemValue.toLowerCase().replace(/[^a-z0-9]/g, "_");
      await setDoc(doc(db, path, newId), {
        value: activeTab === "diameters" || activeTab === "pressures" ? Number(newItemValue) : newItemValue,
        label: newItemLabel || newItemValue,
        isActive: true,
        order: config[activeTab].length * 10
      });
      setNewItemValue("");
      setNewItemLabel("");
      toast.success("Toegevoegd!");
    } catch (e: any) {
      toast.error("Fout: " + e.message);
    }
  };

  const currentList = config[activeTab] || [];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
          <Settings className="text-blue-600" />
          <h2 className="text-xl font-bold text-slate-800">Factory Configuraties</h2>
        </div>
        
        <div className="flex border-b border-slate-200">
          {(["productTypes", "connectionTypes", "diameters", "pressures", "printerRules"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-4 text-sm font-bold uppercase tracking-wider ${activeTab === tab ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-500 hover:text-slate-800"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-6 space-y-6">
          {activeTab !== "printerRules" ? (
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-end gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Waarde</label>
                <input 
                  type="text" 
                  value={newItemValue}
                  onChange={e => setNewItemValue(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Bijv. 150 of FLENS"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Label (Optioneel)</label>
                <input 
                  type="text" 
                  value={newItemLabel}
                  onChange={e => setNewItemLabel(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Weergave naam"
                />
              </div>
              <button 
                onClick={handleAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700"
              >
                <Plus size={18} /> Toevoegen
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 text-sm text-blue-800">
                <Info className="shrink-0 text-blue-500 mt-0.5" size={18} />
                <div>
                  <strong>Tip voor RegEx (Reguliere Expressies):</strong> Met RegEx kun je slimme patronen maken. 
                  Een veelgebruikte regel is bijvoorbeeld <code>^BM\d+$</code>.
                  <ul className="list-disc ml-5 mt-1 text-blue-700">
                    <li><code>^</code> = moet hiermee beginnen</li>
                    <li><code>BM</code> = de letters "BM"</li>
                    <li><code>\d+</code> = één of meerdere cijfers</li>
                    <li><code>$</code> = moet hiermee eindigen</li>
                  </ul>
                  Dit betekent: <em>"Alles wat begint met BM en eindigt met cijfers (zoals BM01 of BM12), maar geen andere letters bevat."</em>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Type conditie</label>
                  <select 
                    value={ruleConditionType}
                    onChange={e => setRuleConditionType(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="itemCode">Item Code</option>
                    <option value="station">Werkstation</option>
                    <option value="productType">Product Type</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Operator</label>
                  <select 
                    value={ruleOperator}
                    onChange={e => setRuleOperator(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="startsWith">Begint met</option>
                    <option value="regex">RegEx Match</option>
                    <option value="equals">Is exact gelijk aan</option>
                    <option value="includes">Bevat</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Waarde</label>
                  <input 
                    type="text" 
                    value={ruleConditionValue}
                    onChange={e => setRuleConditionValue(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Bijv. FL of ^BH\d+$"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Doel Printer</label>
                  <input 
                    type="text" 
                    value={ruleTargetPrinter}
                    onChange={e => setRuleTargetPrinter(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Bijv. MAZAK of BM"
                  />
                </div>
                <button 
                  onClick={handleAdd}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700"
                >
                  <Plus size={18} /> Toevoegen
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {currentList.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-white border border-slate-200 rounded-xl hover:shadow-md transition-shadow">
                {activeTab === "printerRules" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500">Als</span>
                    <span className="font-bold text-sm text-slate-700 bg-slate-100 px-2 py-1 rounded">{item.conditionType}</span>
                    <span className="text-sm text-slate-500">{item.operator}</span>
                    <span className="font-mono font-bold text-sm text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-100">{item.conditionValue}</span>
                    <ArrowRight size={16} className="text-slate-400 mx-2" />
                    <span className="text-sm text-slate-500">Print op:</span>
                    <span className="font-bold text-sm text-purple-700 bg-purple-50 px-2 py-1 rounded border border-purple-100">{item.targetPrinter}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-4">
                    <div className="font-mono text-sm font-bold text-slate-700 w-32">{item.value}</div>
                    <div className="text-sm text-slate-500">{item.label}</div>
                  </div>
                )}
                <button 
                  onClick={() => handleDelete(activeTab, item.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
            {currentList.length === 0 && (
              <div className="text-center text-slate-400 py-10 italic">
                Geen data gevonden in deze collectie. Vergeet niet de migratie te draaien!
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigManagerView;
