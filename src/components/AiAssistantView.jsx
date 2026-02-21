import React, { useState } from "react";
import {
  Bot,
  MessageSquare,
  GraduationCap,
  Download,
} from "lucide-react";
import * as XLSX from 'xlsx';
import { useNotifications } from "../../contexts/NotificationContext";
import { getRawPlanningData } from "../../services/planningContext";
import AiChatView from "./AiChatView";
import AiTrainingView from "./AiTrainingView";

const AiAssistantView = () => {
  const { showError, showSuccess, showInfo } = useNotifications();
  const [activeTab, setActiveTab] = useState("chat");

  const handleExportExcel = async () => {
    try {
      if (showInfo) showInfo("Planning data ophalen...");
      const data = await getRawPlanningData(100);
      
      if (data.length === 0) {
        showError("Geen data gevonden om te exporteren.");
        return;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Planning Export");
      
      XLSX.writeFile(wb, `FPi_Planning_Export_${new Date().toISOString().slice(0,10)}.xlsx`);
      showSuccess("Excel bestand gedownload!");
    } catch (error) {
      console.error("Export fout:", error);
      showError("Kon niet exporteren naar Excel.");
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in fade-in">
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex justify-between items-center shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Bot className="text-blue-600" />
            AI Assistent
          </h1>
          <p className="text-slate-500 font-medium text-sm mt-1">
            Stel vragen, vraag om uitleg, of start een trainingssessie.
          </p>
          <p className="text-xs text-orange-500 mt-1 font-medium">
            AI is aan het leren, fouten kunnen voorkomen.
          </p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "chat"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <MessageSquare size={16} /> Chat
          </button>
          <button
            onClick={() => setActiveTab("training")}
            className={`px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all ${
              activeTab === "training"
                ? "bg-white text-purple-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <GraduationCap size={16} /> Training
          </button>
          
          <button
            onClick={handleExportExcel}
            className="px-3 py-2 rounded-lg text-slate-500 hover:text-green-600 hover:bg-white transition-all border border-transparent hover:border-slate-200"
            title="Exporteer huidige planning naar Excel"
          >
            <Download size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        {activeTab === "chat" && <AiChatView />}
        {activeTab === "training" && <AiTrainingView />}
      </div>
    </div>
  );
};

export default AiAssistantView;
