import React from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProductionStart } from "./productionstart/useProductionStart";
import { ConfigPanel } from "./productionstart/ConfigPanel";
import { PreviewPane } from "./productionstart/PreviewPane";

export type OrderLike = Record<string, unknown>;

const ProductionStartModal = (props: {
  order: OrderLike;
  isOpen: boolean;
  onClose: () => void;
  onStartInitiated?: () => void;
  onStart: (...args: unknown[]) => void | Promise<void>;
  onOpenProductInfo?: (...args: unknown[]) => void;
  stationId?: string;
  existingProducts?: OrderLike[];
}) => {
  const state = useProductionStart(props);
  if (!state) return null;
  
  const { showPreviewPane } = state;
  
  return (
    <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center p-2 md:p-4 backdrop-blur-md animate-in fade-in overflow-hidden">
      <div className={`bg-white w-full max-w-6xl h-[calc(100dvh-1rem)] lg:h-[85dvh] rounded-[40px] shadow-2xl flex flex-col lg:flex-row overflow-hidden border border-white/10 transition-all duration-300`}>
        <ConfigPanel state={state} />
        {showPreviewPane && <PreviewPane state={state} />}
      </div>
    </div>
  );
};

export default ProductionStartModal;
