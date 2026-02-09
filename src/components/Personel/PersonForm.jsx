import React, { useState, useEffect } from "react";
import { Save, User, Briefcase, Hash, Mail, RefreshCw, Layers, Link, Calendar, Clock, AlertTriangle } from "lucide-react";

const emptyPerson = {
	name: "",
	email: "",
	employeeNumber: "",
	departmentId: "",
	role: "Operator",
	rotationType: "STATIC",
	shiftId: "",
	linkedUserId: "",
    temporaryAssignment: null,
};

const PersonForm = ({ person, departments = [], users = [], onSave }) => {
	const [formData, setFormData] = useState(emptyPerson);
	const [availableShifts, setAvailableShifts] = useState([]);
    const [activeTab, setActiveTab] = useState("general"); // 'general' | 'temporary'

    // State voor tijdelijke toewijzing
    const [tempAssignment, setTempAssignment] = useState({
        isActive: false,
        departmentId: "",
        shiftId: "",
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
    });
    const [tempAvailableShifts, setTempAvailableShifts] = useState([]);

	// Initialisatie bij openen
	useEffect(() => {
		if (person) {
			setFormData({
				...emptyPerson,
				...person,
				resetRotation: false
			});
            
            if (person.temporaryAssignment) {
                setTempAssignment({
                    isActive: true,
                    ...person.temporaryAssignment
                });
            } else {
                 setTempAssignment({
                    isActive: false,
                    departmentId: person.departmentId || "",
                    shiftId: "",
                    startDate: new Date().toISOString().split('T')[0],
                    endDate: new Date().toISOString().split('T')[0],
                });
            }
		} else {
			setFormData(emptyPerson);
            setTempAssignment({
                isActive: false,
                departmentId: "",
                shiftId: "",
                startDate: new Date().toISOString().split('T')[0],
                endDate: new Date().toISOString().split('T')[0],
            });
		}
	}, [person]);

	// Update beschikbare ploegen als afdeling verandert (Algemeen)
	useEffect(() => {
		if (formData.departmentId && departments.length > 0) {
			const dept = departments.find(d => d.id === formData.departmentId);
			if (dept && dept.shifts) {
				setAvailableShifts(dept.shifts);
				// Als huidige shift niet in nieuwe afdeling zit, resetten
				if (formData.shiftId && !dept.shifts.find(s => s.id === formData.shiftId)) {
					setFormData(prev => ({ ...prev, shiftId: "" }));
				}
			} else {
				setAvailableShifts([]);
			}
		}
	}, [formData.departmentId, departments]);

    // Update beschikbare ploegen voor tijdelijke toewijzing
    useEffect(() => {
		if (tempAssignment.departmentId && departments.length > 0) {
			const dept = departments.find(d => d.id === tempAssignment.departmentId);
			setTempAvailableShifts(dept ? dept.shifts || [] : []);
		} else {
            setTempAvailableShifts([]);
        }
	}, [tempAssignment.departmentId, departments]);

	const handleChange = (e) => {
		const { name, value } = e.target;
		if (name === "rotationType") {
			setFormData((prev) => ({ ...prev, [name]: value, shiftId: "", shiftName: "" }));
		} else {
			setFormData((prev) => ({ ...prev, [name]: value }));
		}
	};

	const handleDepartmentChange = (e) => {
		const deptId = e.target.value;
		const dept = departments.find(d => d.id === deptId);
		setFormData(prev => ({
			...prev,
			departmentId: deptId,
			departmentName: dept ? dept.name : "",
			shiftId: "" // Reset shift bij afdeling wissel
		}));
	};

	const handleShiftChange = (e) => {
		const shiftId = e.target.value;
		const shift = availableShifts.find(s => s.id === shiftId);
		setFormData(prev => ({
			...prev,
			shiftId: shiftId,
			shiftName: shift ? shift.label : "",
			resetRotation: true // Belangrijk: als je handmatig de shift aanpast, resetten we de rotatie naar deze week
		}));
	};

    const handleTempChange = (e) => {
        const { name, value } = e.target;
        setTempAssignment(prev => ({ ...prev, [name]: value }));
    };

	const handleSubmit = (e) => {
		e.preventDefault();
        
        const finalData = { ...formData };
        
        // Verwerk tijdelijke toewijzing
        if (tempAssignment.isActive) {
            if (!tempAssignment.departmentId || !tempAssignment.shiftId) {
                alert("Selecteer een afdeling en ploeg voor de tijdelijke toewijzing.");
                return;
            }
            finalData.temporaryAssignment = {
                departmentId: tempAssignment.departmentId,
                shiftId: tempAssignment.shiftId,
                startDate: tempAssignment.startDate,
                endDate: tempAssignment.endDate
            };
        } else {
            finalData.temporaryAssignment = null;
        }

		if (onSave) onSave(finalData);
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
            {/* TABS */}
            <div className="flex border-b border-slate-100 mb-6">
                <button
                    type="button"
                    onClick={() => setActiveTab("general")}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
                        activeTab === "general" 
                            ? "border-blue-600 text-blue-600" 
                            : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                >
                    Algemeen
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("temporary")}
                    className={`flex-1 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
                        activeTab === "temporary" 
                            ? "border-orange-500 text-orange-600" 
                            : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                >
                    Tijdelijke Wijziging
                </button>
            </div>

            {activeTab === "general" ? (
                <>
                    {/* Persoonlijke Info */}
                    <div className="space-y-4">
				<h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
					Persoonsgegevens
				</h4>
				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-1">
						<label className="text-xs font-bold text-slate-600 flex items-center gap-2">
							<User size={14} /> Naam
						</label>
						<input
							type="text"
							name="name"
							required
							value={formData.name}
							onChange={handleChange}
							className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 outline-none"
							placeholder="Volledige naam"
						/>
					</div>
					<div className="space-y-1">
						<label className="text-xs font-bold text-slate-600 flex items-center gap-2">
							<Hash size={14} /> Personeelsnummer
						</label>
						<input
							type="text"
							name="employeeNumber"
							required
							value={formData.employeeNumber}
							onChange={handleChange}
							className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-slate-700 focus:border-blue-500 outline-none"
							placeholder="000000"
						/>
					</div>
				</div>
				<div className="space-y-1">
					<label className="text-xs font-bold text-slate-600 flex items-center gap-2">
						<Mail size={14} /> Email (Optioneel)
					</label>
					<input
						type="email"
						name="email"
						value={formData.email}
						onChange={handleChange}
						className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none"
						placeholder="email@futurepipe.com"
					/>
				</div>
				<div className="space-y-1">
					<label className="text-xs font-bold text-slate-600 flex items-center gap-2">
						<Link size={14} /> Koppel Gebruikersaccount (Optioneel)
					</label>
					<select
						name="linkedUserId"
						value={formData.linkedUserId || ""}
						onChange={handleChange}
						className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-blue-500 outline-none appearance-none"
					>
						<option value="">-- Geen koppeling --</option>
						{users.map((u) => (
							<option key={u.id} value={u.id}>{u.name} ({u.email})</option>
						))}
					</select>
					<p className="text-[10px] text-slate-400 italic mt-1 ml-1">
						Koppel dit personeelslid aan een inlog-account (bijv. voor Teamleaders).
					</p>
				</div>
			        </div>

			        {/* Werk Info */}
			        <div className="space-y-4">
				<h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
					Functie & Afdeling
				</h4>
				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-1">
						<label className="text-xs font-bold text-slate-600 flex items-center gap-2">
							<Briefcase size={14} /> Afdeling
						</label>
						<select
							name="departmentId"
							required
							value={formData.departmentId}
							onChange={handleDepartmentChange}
							className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 outline-none appearance-none"
						>
							<option value="">-- Selecteer --</option>
							{departments.map(dept => (
								<option key={dept.id} value={dept.id}>{dept.name}</option>
							))}
						</select>
					</div>
					<div className="space-y-1">
						<label className="text-xs font-bold text-slate-600 flex items-center gap-2">
							<User size={14} /> Rol
						</label>
						<select
							name="role"
							value={formData.role}
							onChange={handleChange}
							className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 outline-none appearance-none"
						>
							<option value="Operator">Operator</option>
							<option value="Teamleader">Teamleader</option>
							<option value="Engineer">Engineer</option>
							<option value="Admin">Admin</option>
						</select>
					</div>
				</div>
			        </div>

			        {/* Rooster Info */}
			        <div className="space-y-4">
				<h4 className="text-xs font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">
					Rooster & Rotatie
				</h4>
				<div className="grid grid-cols-2 gap-4">
					<div className="space-y-1">
						<label className="text-xs font-bold text-slate-600 flex items-center gap-2">
							<RefreshCw size={14} /> Rotatie Type
						</label>
						<select
							name="rotationType"
							value={formData.rotationType}
							onChange={handleChange}
							className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-500 outline-none appearance-none"
						>
							<option value="STATIC">Vaste Ploeg (Dagdienst)</option>
							<option value="2-SHIFT">2-Ploegen</option>
							<option value="3-SHIFT">3-Ploegen</option>
						</select>
					</div>
					<div className="space-y-1">
						<label className="text-xs font-bold text-slate-600 flex items-center gap-2">
							<Layers size={14} /> Huidige Ploeg (Deze week)
						</label>
						<select
							name="shiftId"
							required
							value={formData.shiftId}
							onChange={handleShiftChange}
							className={`w-full p-3 border rounded-xl font-bold text-slate-700 focus:border-blue-500 outline-none appearance-none ${
								formData.resetRotation ? "bg-blue-50 border-blue-300" : "bg-slate-50 border-slate-200"
							}`}
							disabled={!formData.departmentId}
						>
							<option value="">-- Selecteer Huidige Ploeg --</option>
							{availableShifts.filter(shift => {
								const isDag = (shift.label || "").toLowerCase().includes("dag") || (shift.id || "").toUpperCase().includes("DAG");
								if (formData.rotationType === "STATIC") {
									return isDag;
								} else {
									return !isDag;
								}
							}).map(shift => (
								<option key={shift.id} value={shift.id}>{shift.label}</option>
							))}
						</select>
						{formData.resetRotation && (
							<p className="text-[10px] text-blue-600 font-bold mt-1">
								* Rotatie wordt gereset naar deze ploeg vanaf deze week.
							</p>
						)}
					</div>
				</div>
			        </div>
                </>
            ) : (
                /* TAB 2: TIJDELIJKE WIJZIGING */
                <div className="space-y-6 animate-in fade-in">
                    <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                        <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-black text-orange-800 uppercase tracking-wide flex items-center gap-2">
                                <AlertTriangle size={16} /> Tijdelijke Toewijzing
                            </h4>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="sr-only peer"
                                    checked={tempAssignment.isActive}
                                    onChange={(e) => setTempAssignment(prev => ({ ...prev, isActive: e.target.checked }))}
                                />
                                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                            </label>
                        </div>
                        <p className="text-xs text-orange-700">
                            Activeer dit om de medewerker tijdelijk in een andere ploeg of afdeling te plaatsen.
                            Na de einddatum valt de medewerker automatisch terug naar de vaste instellingen.
                        </p>
                    </div>

                    {tempAssignment.isActive && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Afdeling (Uitlenen)</label>
                                <select 
                                    name="departmentId" 
                                    value={tempAssignment.departmentId} 
                                    onChange={handleTempChange}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-orange-500 outline-none"
                                >
                                    <option value="">-- Selecteer Afdeling --</option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Ploeg / Dienst</label>
                                <select 
                                    name="shiftId" 
                                    value={tempAssignment.shiftId} 
                                    onChange={handleTempChange}
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-orange-500 outline-none"
                                    disabled={!tempAssignment.departmentId}
                                >
                                    <option value="">-- Selecteer Ploeg --</option>
                                    {tempAvailableShifts.map(s => (
                                        <option key={s.id} value={s.id}>{s.label}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Calendar size={14} /> Start Datum
                                    </label>
                                    <input 
                                        type="date" 
                                        name="startDate"
                                        value={tempAssignment.startDate}
                                        onChange={handleTempChange}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-orange-500 outline-none"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                        <Clock size={14} /> Eind Datum
                                    </label>
                                    <input 
                                        type="date" 
                                        name="endDate"
                                        value={tempAssignment.endDate}
                                        onChange={handleTempChange}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:border-orange-500 outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

			<button
				type="submit"
				className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 active:scale-95 mt-6"
			>
				<Save size={18} />
				{person ? "Wijzigingen Opslaan" : "Personeel Toevoegen"}
			</button>
		</form>
	);
};

export default PersonForm;
