import React, { useState } from "react";
import { X } from "lucide-react";

const ProductMoveModal = ({ product, onClose, onMove }) => {
  const [newStation, setNewStation] = useState("");

  const handleMove = () => {
    if (newStation && onMove) {
      onMove(product.lotNumber, newStation);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-slate-800">
            Verplaats Product
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Verplaats product{" "}
          <span className="font-bold">{product?.lotNumber}</span> naar een nieuw
          station:
        </p>
        <input
          type="text"
          value={newStation}
          onChange={(e) => setNewStation(e.target.value)}
          placeholder="Nieuw station (bv. BH11)"
          className="w-full p-3 rounded-md border border-slate-200 focus:border-blue-300 outline-none transition-shadow shadow-sm mb-4"
        />
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-slate-500">
            Annuleren
          </button>
          <button onClick={handleMove} className="px-4 py-2 bg-blue-600 text-white rounded-md font-bold uppercase text-xs tracking-wider">
            Verplaats
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductMoveModal;