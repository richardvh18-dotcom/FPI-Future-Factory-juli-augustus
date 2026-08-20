
import React from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Package, Loader2, ClipboardCheck, History, ArrowLeft, ArrowRight,
  ScanBarcode, Keyboard, Printer, ChevronDown, ChevronRight, Search,
  Tag, Calendar, Save, Trash2, X, Hash
} from "lucide-react";
import StatusBadge from "../../common/StatusBadge";
import AutoScaledLabelPreview from "../../../printer/AutoScaledLabelPreview";
import { ProductItem, PlanningOrder, LabelTemplate, SavedFreeLabelTemplate, MazakTab, DisplayRow, SeriesHeaderRow } from "../mazak.types";
import * as helpers from "../utils/mazakHelpers";


export const MazakTabNavigation = ({ activeTab, onSelectTab, t }: MazakTabNavigationProps) => (
  <div className="p-2 bg-slate-50 border-b border-slate-200 shrink-0 shadow-sm">
    <div className="flex justify-center overflow-x-auto">
      <div className="flex bg-slate-200 p-1 rounded-2xl w-full max-w-2xl min-w-[320px]">
        <button
          onClick={() => onSelectTab("planning")}
          className={`flex-1 px-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "planning" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          Planning
        </button>
        <button
          onClick={() => onSelectTab("inbox")}
          className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "inbox" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          {t("mazak.tab_inbox", "Inbox / Printen")}
        </button>
        <button
          onClick={() => onSelectTab("process")}
          className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "process" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          {t("mazak.tab_complete", "Gereedmelden")}
        </button>
        <button
          onClick={() => onSelectTab("adjust")}
          className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "adjust" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          {t("mazak.tab_adjust", "Aanpassen")}
        </button>
        <button
          onClick={() => onSelectTab("free")}
          className={`flex-1 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === "free" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
        >
          {t("mazak.tab_labels", "Labels")}
        </button>
      </div>
    </div>
  </div>
);

export const MazakListItemCard = ({ item, activeTab, isSelected, onSelect, t }: MazakListItemCardProps) => (
  <div
    onClick={() => onSelect(item)}
    className={`bg-white border-2 rounded-2xl p-3 shadow-sm hover:border-blue-300 transition-all group animate-in slide-in-from-bottom-2 cursor-pointer ${isSelected ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-100"}`}
  >
    <div className="flex justify-between items-start mb-2">
      <div className="text-left">
        <span className="text-[9px] font-black text-slate-400 uppercase block mb-1">{item.orderId}</span>
        <span className="font-black text-slate-900 text-base tracking-tighter">{item.lotNumber}</span>
        <p className="text-[10px] font-bold text-slate-500 mt-0.5 truncate max-w-[180px]">{item.item}</p>
      </div>
      <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${activeTab === "inbox" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
        {activeTab === "inbox" ? t("mazak.print_badge", "Printen") : t("mazak.complete_badge", "Gereedmelden")}
      </div>
    </div>
    <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{t("lossen.manufactured_item")}</p>
      <p className="text-[10px] font-mono font-bold text-slate-700 truncate">{item.itemCode}</p>
      {item.lastStation && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-200/60 opacity-80">
          <History size={10} className="text-blue-500" />
          <span className="text-[8px] font-black text-slate-500 uppercase italic">
            {t("mazak.from_station", "Van")}: {item.lastStation}
          </span>
        </div>
      )}
    </div>
  </div>
);

export const MazakPlanningOrderCard = ({
  order,
  isSelected,
  onSelect,
  orderMaterialBadge,
  orderProduced,
  orderTotal,
  orderDeliveryLabel,
  orderDeliveryColorClass,
  t,
}: MazakPlanningOrderCardProps) => (
  <div
    onClick={() => onSelect(order)}
    className={`min-h-[100px] px-4 py-3 rounded-3xl border-2 transition-all flex items-center justify-between relative overflow-hidden cursor-pointer ${
      isSelected
        ? "bg-emerald-50 border-emerald-500 shadow-md shadow-emerald-100 translate-x-1"
        : "bg-white border-slate-100 hover:border-blue-300"
    }`}
  >
    <div className="flex items-center gap-4 flex-1 overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block px-3 py-1 bg-slate-200 text-slate-800 rounded-lg text-sm font-black uppercase tracking-wider border border-slate-300 shadow-sm">
            {t("productionStartModal.labels.order", "Order")}: {String(order.orderId || "-")}
          </span>
          {orderMaterialBadge && (
            <span className="inline-block px-2.5 py-1 bg-sky-100 text-sky-700 border border-sky-200 rounded-lg text-[11px] font-black uppercase tracking-wide">
              {orderMaterialBadge}
            </span>
          )}
        </div>
        <h4 className="font-black text-base sm:text-lg leading-tight uppercase text-slate-900 mb-1 line-clamp-2">
          {String(order.item || "-")}
        </h4>
      </div>
    </div>
    <div className="flex flex-col items-end gap-1.5 text-right shrink-0 ml-4">
      <StatusBadge status={order.status} />
      <span className="text-xs font-black text-slate-700 uppercase tracking-tighter">
        {t("digitalplanning.terminal.made", "Gemaakt")}: {orderProduced} / {orderTotal} ST
      </span>
      <span className={`text-xs uppercase tracking-tighter ${orderDeliveryColorClass}`}>
        {orderDeliveryLabel}
      </span>
    </div>
  </div>
);

export const MazakAdjustListItemCard = ({ item, isSelected, onSelect, t }: MazakAdjustListItemCardProps) => {
  const stage = item.mazakLabelPrinted
    ? t("mazak.complete_badge", "Gereedmelden")
    : t("mazak.print_badge", "Printen");

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`w-full text-left bg-white border-2 rounded-2xl p-4 shadow-sm transition-all ${isSelected ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-100 hover:border-blue-200"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.orderId || "-"}</p>
          <p className="text-base font-black text-slate-900">{item.lotNumber || item.id || "-"}</p>
          <p className="text-xs font-bold text-slate-600 mt-1 truncate">{item.item || "-"}</p>
          <p className="text-[10px] font-black text-slate-400 uppercase mt-1">{item.itemCode || "-"}</p>
        </div>
        <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase ${item.mazakLabelPrinted ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
          {stage}
        </span>
      </div>
    </button>
  );
};

export const MazakSelectedProductHero = ({ product, onClear, t }: MazakSelectedProductHeroProps) => (
  <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
    <div className="flex justify-between items-start mb-8 relative z-10">
      <div>
        <button
          onClick={onClear}
          className="lg:hidden p-2 bg-white/10 rounded-full mb-4 inline-block"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="mb-2">
          <span className="inline-block px-4 py-1.5 bg-white/25 text-white rounded-xl text-base font-black uppercase tracking-widest border border-white/40 shadow-sm">
            {t("productionStartModal.labels.order", "Order")}: {product.orderId}
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-black text-white leading-tight uppercase italic max-w-3xl mb-1.5">
          {product.item || "-"}
        </h2>
        <p className="text-xs font-bold text-white/60 mt-1">
          {product.itemCode || "-"}
        </p>
      </div>
      <div className="flex items-start gap-3">
        <StatusBadge status={product.status} />
        <button onClick={onClear} className="p-2 rounded-full text-slate-300 hover:bg-white/10">
          <X size={20} />
        </button>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-white/10 pt-8 relative z-10">
      <div>
        <p className="text-[10px] font-black text-white/40 uppercase mb-1">Lotnummer</p>
        <p className="text-lg font-black text-sky-300">{product.lotNumber || "-"}</p>
      </div>
      <div>
        <p className="text-[10px] font-black text-white/40 uppercase mb-1">Wikkelmachine</p>
        <p className="text-lg font-black text-amber-300">{product.lastStation || "Onbekend"}</p>
      </div>
      <div>
        <p className="text-[10px] font-black text-white/40 uppercase mb-1">Status</p>
        <p className="text-lg font-black text-blue-300 uppercase">{String(product.status || "-")}</p>
      </div>
    </div>
  </div>
);

export const MazakSelectedPlanningOrderHero = ({
  order,
  materialBadge,
  deliveryLabel,
  quantity,
  produced,
  t,
  onClear,
}: MazakSelectedPlanningOrderHeroProps) => (
  <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
    <div className="flex justify-between items-start mb-8 relative z-10">
      <div>
        <button
          onClick={onClear}
          className="lg:hidden p-2 bg-white/10 rounded-full mb-4 inline-block"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="mb-2">
          <span className="inline-block px-4 py-1.5 bg-white/25 text-white rounded-xl text-base font-black uppercase tracking-widest border border-white/40 shadow-sm">
            {t("productionStartModal.labels.order", "Order")}: {order.orderId}
          </span>
        </div>
        <h2 className="text-2xl md:text-3xl font-black text-white leading-tight uppercase italic max-w-3xl mb-1.5">
          {order.item || "-"}
        </h2>
        <p className="text-xs font-bold text-white/60 mt-1">
          {order.itemCode || "-"}
        </p>
        {materialBadge && (
          <div className="mt-2">
            <span className="inline-block px-2.5 py-1 bg-sky-300 text-sky-950 rounded-lg text-[11px] font-black uppercase tracking-wide">
              {materialBadge}
            </span>
          </div>
        )}
      </div>
      <StatusBadge status={order.status} />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-white/10 pt-8 relative z-10">
      <div>
        <p className="text-[10px] font-black text-white/40 uppercase mb-1">
          {t("digitalplanning.order_detail.delivery_date_aq", "Leverdatum (AQ)")}
        </p>
        <p className="text-lg font-black text-sky-300">
          {deliveryLabel}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-black text-white/40 uppercase mb-1">
          {t("digitalplanning.order_detail.total_plan", "Orderhoeveelheid")}
        </p>
        <p className="text-lg font-black text-amber-300">
          {quantity} {t("digitalplanning.terminal.pieces", "stuks")}
        </p>
      </div>
      <div>
        <p className="text-[10px] font-black text-white/40 uppercase mb-1">
          {t("digitalplanning.terminal.made", "Gemaakt")}
        </p>
        <p className="text-lg font-black text-blue-300">
          {produced} {t("digitalplanning.terminal.pieces", "stuks")}
        </p>
      </div>
    </div>
  </div>
);

export const MazakPlanningActiveLotsPanel = ({ products, onSelectProduct, t }: MazakPlanningActiveLotsPanelProps) => (
  <div className="border-t border-white/10 pt-6 mt-6 relative z-10">
    <p className="text-[10px] font-black text-white/40 uppercase mb-3 tracking-widest">
      {t("digitalplanning.terminal.active_lots", "Actieve lotnummers")} ({products.length})
    </p>
    {products.length === 0 ? (
      <p className="text-xs font-bold text-white/60 italic">
        {t("mazak.no_active_lots_for_order", "Nog geen actieve lotnummers voor deze order.")}
      </p>
    ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {products.map((product) => {
          const lotKey = String(product?.lotNumber || product?.id || "-");
          return (
            <button
              key={String(product?.id || lotKey)}
              type="button"
              onClick={() => onSelectProduct(product)}
              className="text-left px-3 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 transition-all"
            >
              <p className="text-xs font-black text-white uppercase tracking-wide">{lotKey}</p>
              <p className="text-[10px] font-bold text-white/70 truncate">
                {String(product?.item || product?.itemCode || "-")}
              </p>
            </button>
          );
        })}
      </div>
    )}
  </div>
);

export const MazakAdjustSelectionPanel = ({
  product,
  onChangeOrder,
  onRequestNewOrder,
  t,
}: MazakAdjustSelectionPanelProps) => (
  <>
    <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
      <div className="mb-4">
        <span className="inline-block px-4 py-1.5 bg-white/25 text-white rounded-xl text-base font-black uppercase tracking-widest border border-white/40 shadow-sm">
          {t("productionStartModal.labels.order", "Order")}: {product.orderId || "-"}
        </span>
      </div>
      <h2 className="text-2xl md:text-3xl font-black text-white leading-tight uppercase italic max-w-3xl mb-1.5">
        {product.item || "-"}
      </h2>
      <p className="text-xs font-bold text-white/60 mt-1">{product.itemCode || "-"}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-white/10 pt-6 mt-6">
        <div>
          <p className="text-[10px] font-black text-white/40 uppercase mb-1">Lotnummer</p>
          <p className="text-lg font-black text-sky-300">{product.lotNumber || product.id || "-"}</p>
        </div>
        <div>
          <p className="text-[10px] font-black text-white/40 uppercase mb-1">Huidige fase</p>
          <p className="text-lg font-black text-amber-300">
            {product.mazakLabelPrinted
              ? t("mazak.complete_badge", "Gereedmelden")
              : t("mazak.print_badge", "Printen")}
          </p>
        </div>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <button
        onClick={onChangeOrder}
        className="p-6 bg-white rounded-3xl border-2 border-slate-100 hover:border-blue-400 hover:shadow-lg transition-all flex flex-col items-center justify-center gap-3 group"
      >
        <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
          <ArrowRight size={32} />
        </div>
        <span className="text-sm font-black uppercase tracking-widest text-slate-700 group-hover:text-blue-700">
          Ordernummer wijzigen
        </span>
      </button>
      <button
        onClick={onRequestNewOrder}
        className="p-6 bg-white rounded-3xl border-2 border-slate-100 hover:border-amber-400 hover:shadow-lg transition-all flex flex-col items-center justify-center gap-3 group"
      >
        <div className="p-4 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-500 group-hover:text-white transition-colors">
          <Tag size={32} />
        </div>
        <span className="text-sm font-black uppercase tracking-widest text-slate-700 group-hover:text-amber-700">
          Verzoek nieuw ordernummer
        </span>
      </button>
    </div>
  </>
);

export const MazakEmptySelectionPlaceholder = ({ activeTab, t }: MazakEmptySelectionPlaceholderProps) => (
  <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center text-left">
    {activeTab === "inbox" ? (
      <Printer size={80} className="mb-6 text-slate-200" />
    ) : activeTab === "planning" ? (
      <History size={80} className="mb-6 text-slate-200" />
    ) : activeTab === "free" ? (
      <Tag size={80} className="mb-6 text-slate-200" />
    ) : (
      <ClipboardCheck size={80} className="mb-6 text-slate-200" />
    )}
    <h4 className="text-2xl font-black uppercase italic text-slate-300 text-left">
      {activeTab === "inbox"
        ? t("mazak.select_to_print", "Selecteer order om te printen")
        : activeTab === "planning"
          ? t("mazak.select_planned_order", "Selecteer geplande order")
          : activeTab === "adjust"
            ? t("mazak.adjust_pick_product", "Selecteer lot voor aanpassen")
            : activeTab === "free"
              ? t("mazak.labels_ready", "Kies een label type om te printen")
              : t("mazak.select_to_process", "Selecteer order om te verwerken")}
    </h4>
  </div>
);

export const MazakFreeLabelHero = ({ t }: MazakFreeLabelHeroProps) => (
  <div className="bg-slate-900 rounded-[35px] p-6 text-white border-4 border-blue-500/20 relative overflow-hidden shadow-xl text-left">
    <span className="text-[8px] font-black text-blue-400 uppercase block mb-1 text-left">{t("mazak.labels_header", "Labels")}</span>
    <h2 className="text-3xl font-black italic leading-none text-left">100 x 25 mm</h2>
    <p className="text-xs font-bold text-white/70 mt-2">{t("mazak.labels_subtitle", "Kies uit de verschillende label opties")}</p>
  </div>
);

export const MazakFreeLabelPreviewPanel = ({ template, freeText, printerDpi, t }: MazakFreeLabelPreviewPanelProps) => (
  <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm text-left">
    <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.4em] flex items-center gap-2 mb-4">
      <Printer size={12} className="text-blue-500" /> {t("productionStartModal.labels.labelPreview", "Etiket preview")}
    </div>
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100">
      <AutoScaledLabelPreview
        label={template}
        data={{ freeText: freeText || t("mazak.free_label_preview_placeholder", "Vrije tekst preview") }}
        className="w-full"
        printerDpi={printerDpi}
        maxScale={1}
        exactBitmapPreview
      />
    </div>
  </div>
);

export const MazakFreeLabelActions = ({
  printing,
  savingFreeTemplate,
  freeLabelText,
  freeLabelTemplateName,
  freeLabelQuantity,
  onPrint,
  onSaveTemplate,
  t,
}: MazakFreeLabelActionsProps) => (
  <>
    <button
      onClick={onPrint}
      disabled={printing || !freeLabelText.trim()}
      className="w-full py-4 bg-blue-600 text-white rounded-[22px] font-black uppercase text-sm hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {printing ? <Loader2 size={18} className="animate-spin" /> : <Printer size={18} />}
      {printing
        ? t("common.loading", "Laden...")
        : t("mazak.print_free_labels", "Print {{count}} vrij label(s)", { count: Math.max(1, Math.min(50, Number(freeLabelQuantity) || 1)) })}
    </button>

    <button
      onClick={onSaveTemplate}
      disabled={savingFreeTemplate || !freeLabelTemplateName.trim() || !freeLabelText.trim()}
      className="w-full py-3 bg-slate-100 text-slate-700 rounded-[18px] font-black uppercase text-xs hover:bg-slate-200 transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {savingFreeTemplate ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
      {savingFreeTemplate
        ? t("common.loading", "Laden...")
        : t("mazak.save_free_label_template", "Opslaan als template")}
    </button>
  </>
);

export const MazakFreeLabelAlignmentSelector = ({
  align,
  onSelectAlign,
  t,
}: MazakFreeLabelAlignmentSelectorProps) => (
  <div>
    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
      {t("mazak.free_label_alignment", "Uitlijning")}
    </label>
    <div className="grid grid-cols-3 gap-2">
      <button
        type="button"
        onClick={() => onSelectAlign("left")}
        className={`px-3 py-3 rounded-xl border-2 text-xs font-black uppercase tracking-wider transition-all ${align === "left" ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
      >
        {t("common.left", "Links")}
      </button>
      <button
        type="button"
        onClick={() => onSelectAlign("center")}
        className={`px-3 py-3 rounded-xl border-2 text-xs font-black uppercase tracking-wider transition-all ${align === "center" ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
      >
        {t("common.center", "Midden")}
      </button>
      <button
        type="button"
        onClick={() => onSelectAlign("right")}
        className={`px-3 py-3 rounded-xl border-2 text-xs font-black uppercase tracking-wider transition-all ${align === "right" ? "bg-blue-50 border-blue-300 text-blue-700" : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"}`}
      >
        {t("common.right", "Rechts")}
      </button>
    </div>
  </div>
);

export const MazakFreeLabelSizingFields = ({
  freeLabelFontSize,
  freeLabelQuantity,
  onChangeFontSize,
  onChangeQuantity,
  t,
}: MazakFreeLabelSizingFieldsProps) => (
  <>
    <div>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
        {t("mazak.free_label_font_size", "Lettergrootte")}
      </label>
      <input
        type="number"
        min={6}
        max={75}
        value={String(freeLabelFontSize)}
        onChange={(e) => {
          onChangeFontSize(e.target.value);
        }}
        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
      />
      <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
        {t("mazak.free_label_font_size_hint", "Vrij invoerbaar, max 75 pt")}
      </p>
    </div>

    <div>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
        {t("mazak.quantity", "Aantal")}
      </label>
      <input
        type="number"
        min={1}
        max={50}
        value={freeLabelQuantity}
        onChange={(e) => {
          onChangeQuantity(String(e.target.value || "1"));
        }}
        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500"
      />
      <p className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide">
        {t("mazak.fixed_free_label_size", "Vast formaat: 100x25 mm")}
      </p>
    </div>
  </>
);

export const MazakFreeLabelTextFields = ({
  freeLabelTemplateName,
  freeLabelText,
  onChangeTemplateName,
  onChangeFreeText,
  t,
}: MazakFreeLabelTextFieldsProps) => (
  <>
    <div>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
        {t("mazak.free_label_template_name", "Template naam")}
      </label>
      <input
        type="text"
        value={freeLabelTemplateName}
        onChange={(e) => onChangeTemplateName(e.target.value)}
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
        value={freeLabelText}
        onChange={(e) => onChangeFreeText(e.target.value)}
        rows={6}
        maxLength={250}
        placeholder={t("mazak.free_label_placeholder", "Typ hier de tekst voor het vrije label...")}
        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-2xl font-bold text-slate-700 outline-none focus:border-blue-500 resize-none"
      />
    </div>
  </>
);

export const MazakFreeLabelFormPanel = ({
  freeLabelTemplateName,
  freeLabelText,
  freeLabelAlign,
  freeLabelFontSize,
  freeLabelQuantity,
  printing,
  savingFreeTemplate,
  onChangeTemplateName,
  onChangeFreeText,
  onSelectAlign,
  onChangeFontSize,
  onChangeQuantity,
  onPrint,
  onSaveTemplate,
  t,
}: MazakFreeLabelFormPanelProps) => (
  <div className="bg-white rounded-[40px] p-8 border border-slate-200 shadow-sm space-y-5 text-left">
    <MazakFreeLabelTextFields
      freeLabelTemplateName={freeLabelTemplateName}
      freeLabelText={freeLabelText}
      onChangeTemplateName={onChangeTemplateName}
      onChangeFreeText={onChangeFreeText}
      t={t}
    />

    <MazakFreeLabelAlignmentSelector
      align={freeLabelAlign}
      onSelectAlign={onSelectAlign}
      t={t}
    />

    <MazakFreeLabelSizingFields
      freeLabelFontSize={freeLabelFontSize}
      freeLabelQuantity={freeLabelQuantity}
      onChangeFontSize={onChangeFontSize}
      onChangeQuantity={onChangeQuantity}
      t={t}
    />

    <MazakFreeLabelActions
      printing={printing}
      savingFreeTemplate={savingFreeTemplate}
      freeLabelText={freeLabelText}
      freeLabelTemplateName={freeLabelTemplateName}
      freeLabelQuantity={freeLabelQuantity}
      onPrint={onPrint}
      onSaveTemplate={onSaveTemplate}
      t={t}
    />
  </div>
);

export const MazakAdjustModalHeader = ({
  title,
  lotLabel,
  onClose,
  disabled,
}: MazakAdjustModalHeaderProps) => (
  <div className="flex justify-between items-center mb-6">
    <div>
      <h3 className="text-2xl font-black text-slate-800 uppercase italic">
        {title}
      </h3>
      <p className="text-sm text-slate-500 font-bold mt-1">
        Lot: {lotLabel}
      </p>
    </div>
    <button
      onClick={onClose}
      className="p-2 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
      disabled={disabled}
    >
      <X size={24} />
    </button>
  </div>
);

export const MazakAdjustOrderModalActions = ({
  submitting,
  canSubmit,
  onCancel,
  onSubmit,
}: MazakAdjustOrderModalActionsProps) => (
  <div className="mt-6 pt-6 border-t border-slate-100 flex justify-end gap-3 shrink-0">
    <button
      onClick={onCancel}
      className="px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all disabled:opacity-50"
      disabled={submitting}
    >
      Annuleren
    </button>
    <button
      onClick={onSubmit}
      disabled={!canSubmit}
      className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase text-xs hover:bg-blue-700 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
    >
      {submitting ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
      Wijzigen & Printen
    </button>
  </div>
);

export const MazakAdjustRequestModalActions = ({
  submitting,
  canSubmit,
  onCancel,
  onSubmit,
  t,
}: MazakAdjustRequestModalActionsProps) => (
  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
    <button
      onClick={onCancel}
      className="px-6 py-3 rounded-xl bg-slate-100 text-slate-600 font-black uppercase text-xs hover:bg-slate-200 transition-all disabled:opacity-50"
      disabled={submitting}
    >
      Annuleren
    </button>
    <button
      onClick={onSubmit}
      disabled={!canSubmit}
      className="px-6 py-3 bg-amber-500 text-white rounded-xl font-black uppercase text-xs hover:bg-amber-600 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
    >
      {submitting ? <Loader2 size={16} className="animate-spin" /> : <Tag size={16} />}
      {t("mazak.adjust_send_request", "Verzoek nieuw ordernummer versturen")}
    </button>
  </div>
);

export const MazakAdjustPreviewPanel = ({
  hasTargetOrder,
  previewTemplates,
  previewData,
  printerDpi,
}: MazakAdjustPreviewPanelProps) => (
  <div className="flex-1 min-h-0 bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col">
    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-4">
      Nieuw Label Voorbeeld
    </p>
    {hasTargetOrder ? (
      <div className="flex-1 min-h-0 flex flex-col">
        {previewTemplates.length > 0 ? (
          <div className="space-y-4 overflow-y-auto custom-scrollbar pr-2 max-h-[42vh]">
            {previewTemplates.map((template) => (
              <div key={template.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm">
                <p className="text-[9px] font-bold text-slate-400 mb-2 uppercase">{template.name}</p>
                <AutoScaledLabelPreview
                  label={template}
                  data={previewData}
                  printerDpi={printerDpi}
                  maxScale={0.36}
                  exactBitmapPreview
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 font-bold italic">Geen geschikt flens-template gevonden.</p>
        )}
      </div>
    ) : (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xs text-slate-400 font-bold italic text-center">
          Selecteer een doelorder om het nieuwe label te zien.
        </p>
      </div>
    )}
  </div>
);

export const MazakAdjustOrderModalLeftPanel = ({
  adjustOrderSearch,
  selectedAdjustFlangeSize,
  selectedAdjustOrderFamily,
  adjustTargetOrders,
  selectedAdjustTargetOrder,
  adjustReason,
  onChangeAdjustOrderSearch,
  onSelectAdjustTargetOrder,
  onChangeAdjustReason,
  t,
}: MazakAdjustOrderModalLeftPanelProps) => (
  <div className="flex-1 space-y-4">
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
      <input
        type="text"
        value={adjustOrderSearch}
        onChange={(e) => onChangeAdjustOrderSearch(e.target.value)}
        placeholder={t("mazak.adjust_target_search", "Zoek doelorder (ordernummer of type)...")}
        className="w-full pl-11 pr-4 py-3 bg-slate-50 border-2 border-slate-100 focus:border-blue-500 rounded-xl font-bold text-sm outline-none transition-all placeholder:text-slate-300"
      />
    </div>

    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
      {selectedAdjustFlangeSize
        ? t("mazak.adjust_size_filter_active", "Filter actief: alleen flensmaat FL {{size}}", { size: selectedAdjustFlangeSize })
        : selectedAdjustOrderFamily
          ? t("mazak.adjust_family_filter_active", "Filter actief: alleen orders met ID-reeks {{family}}", { family: selectedAdjustOrderFamily })
          : t("mazak.adjust_family_filter_missing", "Geen FL-maat of 3-cijferige ID-reeks gevonden op bronorder; filter niet toegepast")}
    </p>

    <div className="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
      {adjustTargetOrders.length === 0 ? (
        <p className="text-xs font-bold text-slate-500 italic px-1">
          Geen passende order gevonden.
        </p>
      ) : (
        adjustTargetOrders.map((order) => {
          const orderKey = String(order.id || order.orderId || "");
          const isSelected = String(selectedAdjustTargetOrder?.id || selectedAdjustTargetOrder?.orderId || "") === orderKey;
          return (
            <button
              key={orderKey}
              type="button"
              onClick={() => onSelectAdjustTargetOrder(order)}
              className={`w-full text-left px-3 py-2 rounded-xl border transition-all ${isSelected ? "border-blue-400 bg-blue-50" : "border-slate-200 bg-white hover:border-blue-200"}`}
            >
              <p className="text-xs font-black text-slate-800 uppercase tracking-wide">{order.orderId || "-"}</p>
              <p className="text-[11px] font-bold text-slate-600 truncate">{order.item || "-"}</p>
            </button>
          );
        })
      )}
    </div>

    <div>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
        {t("mazak.adjust_reason", "Opmerking / waarom (Verplicht)")}
      </label>
      <textarea
        value={adjustReason}
        onChange={(e) => onChangeAdjustReason(e.target.value)}
        rows={3}
        maxLength={300}
        placeholder={t("mazak.adjust_reason_placeholder", "Waarom wordt dit lot aan een ander ordernummer gekoppeld?")}
        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-blue-500 resize-none"
      />
    </div>
  </div>
);

export const MazakAdjustRequestModalBody = ({
  adjustReason,
  adjustRequestNote,
  onChangeAdjustReason,
  onChangeAdjustRequestNote,
  t,
}: MazakAdjustRequestModalBodyProps) => (
  <div className="space-y-4 mb-6">
    <p className="text-xs font-bold text-slate-600">
      {t("mazak.adjust_no_existing_order_help", "Als er nog geen passende order in de planning staat, stuur je een bericht voor een nieuw ordernummer. Dit product blijft geparkeerd totdat het nieuwe order bestaat en je de aanpassing kunt uitvoeren.")}
    </p>
    <div>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
        Reden (Verplicht)
      </label>
      <textarea
        value={adjustReason}
        onChange={(e) => onChangeAdjustReason(e.target.value)}
        rows={3}
        maxLength={300}
        placeholder="Waarom is een nieuw ordernummer nodig?"
        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-amber-400 resize-none"
      />
    </div>
    <div>
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block ml-1">
        Opmerking
      </label>
      <textarea
        value={adjustRequestNote}
        onChange={(e) => onChangeAdjustRequestNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder={t("mazak.adjust_request_note", "Extra toelichting voor planner/teamleader (optioneel)")}
        className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-xl font-bold text-slate-700 outline-none focus:border-amber-400 resize-none"
      />
    </div>
  </div>
);