import React, { useState, useEffect } from "react";

const HoursDistributionModal = ({ data, onClose, onConfirm }) => {
	const [distributions, setDistributions] = useState([]);

	useEffect(() => {
		if (data) {
			const existing = data.existingAssignments.map(a => ({
				id: a.id,
				stationName: a.machineName,
				hours: a.hours || 8,
				isNew: false
			}));
			
			// Slimme default verdeling
			if (existing.length === 1 && existing[0].hours === 8) {
				// Als er 1 bestaande is met 8 uur, stel 4/4 voor
				existing[0].hours = 4;
				setDistributions([
					...existing,
					{ id: "new", stationName: data.newStation.name, hours: 4, isNew: true }
				]);
			} else {
				// Anders, bereken resttijd
				const totalExisting = existing.reduce((sum, item) => sum + item.hours, 0);
				const remaining = Math.max(0, 8 - totalExisting);
				setDistributions([
					...existing,
					{ id: "new", stationName: data.newStation.name, hours: remaining, isNew: true }
				]);
			}
		}
	}, [data]);

	const updateHours = (index, value) => {
		const newDist = [...distributions];
		newDist[index].hours = parseFloat(value) || 0;
		setDistributions(newDist);
	};
	
	const totalHours = distributions.reduce((sum, d) => sum + d.hours, 0);

	return (
		<div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
			<div className="bg-white rounded-3xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95">
				<h3 className="text-xl font-black text-slate-800 mb-2">Uren Verdelen</h3>
				<p className="text-sm text-slate-500 mb-6">
					<span className="font-bold text-blue-600">{data.person.name}</span> is al actief. Verdeel de uren over de stations.
				</p>
				
				<div className="space-y-4 mb-6">
					{distributions.map((dist, idx) => (
						<div key={dist.id} className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-100">
							<div className="flex flex-col">
								<span className="font-bold text-slate-700 text-sm">{dist.stationName}</span>
								<span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
									{dist.isNew ? "Nieuw Station" : "Huidig Station"}
								</span>
							</div>
							<div className="flex items-center gap-2">
								<input 
									type="number" 
									value={dist.hours}
									onChange={(e) => updateHours(idx, e.target.value)}
									className="w-16 p-2 rounded-lg border border-slate-200 text-center font-bold text-slate-800 outline-none focus:border-blue-500"
									min="0"
									max="24"
									step="0.5"
								/>
								<span className="text-xs font-bold text-slate-400">uur</span>
							</div>
						</div>
					))}
				</div>
				
				<div className="flex justify-between items-center mb-6 px-2">
					<span className="text-xs font-bold text-slate-400 uppercase">Totaal</span>
					<span className={`text-lg font-black ${totalHours > 8 ? "text-orange-500" : "text-emerald-600"}`}>
						{totalHours} uur
					</span>
				</div>

				<div className="flex gap-3">
					<button onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">
						Annuleren
					</button>
					<button onClick={() => onConfirm(distributions)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg">
						Bevestigen
					</button>
				</div>
			</div>
		</div>
	);
};

export default HoursDistributionModal;