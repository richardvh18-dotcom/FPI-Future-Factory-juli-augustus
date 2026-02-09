import React, { useState, useEffect } from "react";
import { X, Save } from "lucide-react";

const TemporaryAssignmentModal = ({ person, departments, onClose, onSave }) => {
	const [formData, setFormData] = useState({
		departmentId: person.departmentId || "",
		shiftId: person.shiftId || "",
		startDate: new Date().toISOString().split('T')[0],
		endDate: new Date().toISOString().split('T')[0],
	});

	const [availableShifts, setAvailableShifts] = useState([]);

	useEffect(() => {
		if (formData.departmentId) {
			const dept = departments.find(d => d.id === formData.departmentId);
			setAvailableShifts(dept ? dept.shifts || [] : []);
		}
	}, [formData.departmentId, departments]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		setFormData(prev => ({ ...prev, [name]: value }));
	};

	const handleSubmit = (e) => {
		e.preventDefault();
		onSave(person.id, formData);
	};

	return (
		<div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
			<div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
				<div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
					<h3 className="text-lg font-black text-slate-800">Tijdelijke Wijziging</h3>
					<button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-all"><X size={20} /></button>
				</div>
				
				<form onSubmit={handleSubmit} className="p-6 space-y-5">
					<div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mb-4">
						<p className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-1">Geselecteerd Personeel</p>
						<p className="text-lg font-black text-slate-800">{person.name}</p>
						<p className="text-xs text-slate-500">{person.department} - {person.shift}</p>
					</div>

					<div className="space-y-2">
						<label className="text-xs font-black text-slate-500 uppercase tracking-widest">Afdeling (Uitlenen)</label>
						<select 
							name="departmentId" 
							value={formData.departmentId} 
							onChange={handleChange}
							className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 outline-none"
						>
							{departments.map(d => (
								<option key={d.id} value={d.id}>{d.name}</option>
							))}
						</select>
					</div>

					<div className="space-y-2">
						<label className="text-xs font-black text-slate-500 uppercase tracking-widest">Ploeg / Dienst</label>
						<select 
							name="shiftId" 
							value={formData.shiftId} 
							onChange={handleChange}
							className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 outline-none"
						>
							<option value="">-- Selecteer Ploeg --</option>
							{availableShifts.map(s => (
								<option key={s.id} value={s.id}>{s.label}</option>
							))}
						</select>
					</div>

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<label className="text-xs font-black text-slate-500 uppercase tracking-widest">Start Datum</label>
							<input 
								type="date" 
								name="startDate"
								value={formData.startDate}
								onChange={handleChange}
								className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 outline-none"
							/>
						</div>
						<div className="space-y-2">
							<label className="text-xs font-black text-slate-500 uppercase tracking-widest">Eind Datum</label>
							<input 
								type="date" 
								name="endDate"
								value={formData.endDate}
								onChange={handleChange}
								className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 outline-none"
							/>
						</div>
					</div>

					<button type="submit" className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 mt-4">
						<Save size={18} /> Opslaan
					</button>
				</form>
			</div>
		</div>
	);
};

export default TemporaryAssignmentModal;