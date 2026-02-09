import React, { useState, useEffect } from "react";
import { BoxSelect, Layers, ArrowRightLeft, Users, ArrowLeft, ChevronDown, Clock } from "lucide-react";

// Helper: groepeer personeel per afdeling/ploeg volgens config
function groupByAfdelingEnPloeg(personnel, departments, shiftsByDept) {
	const grouped = {};
	const deptIdMap = {};
	const shiftIdMap = {}; // { deptId: { shiftId: label } }

	// Eerst alle afdelingen/ploegen uit config aanmaken (ook als leeg)
	for (const dept of departments) {
		const afdeling = dept.name;
		if (dept.id) deptIdMap[dept.id] = afdeling;
		shiftIdMap[dept.id] = {};

		grouped[afdeling] = {};
		(shiftsByDept[afdeling] || []).forEach((shift) => {
			grouped[afdeling][shift.label] = [];
			if (shift.id) shiftIdMap[dept.id][shift.id] = shift.label;
		});
	}

	// Personeel toevoegen aan juiste afdeling/ploeg
	for (const p of personnel) {
		// Check op tijdelijke toewijzing
		let activeDeptId = p.departmentId;
		let activeShiftId = p.shiftId;
		let isTemporary = false;

		if (p.temporaryAssignment) {
			const today = new Date().toISOString().split('T')[0];
			if (today >= p.temporaryAssignment.startDate && today <= p.temporaryAssignment.endDate) {
				activeDeptId = p.temporaryAssignment.departmentId;
				activeShiftId = p.temporaryAssignment.shiftId;
				isTemporary = true;
			}
		}

		// 1. Afdeling bepalen (ID heeft voorrang op oude naam)
		let afdeling = p.department;
		if (activeDeptId && deptIdMap[activeDeptId]) {
			afdeling = deptIdMap[activeDeptId];
		} 
		if (!afdeling) afdeling = "Onbekend";

		// 2. Ploeg bepalen (ID heeft voorrang)
		let ploeg = p.shift;
		if (activeShiftId && activeDeptId && shiftIdMap[activeDeptId]?.[activeShiftId]) {
			ploeg = shiftIdMap[activeDeptId][activeShiftId];
		} else if (activeShiftId) {
			ploeg = activeShiftId; // Fallback
		}
		if (!ploeg) ploeg = "Onbekend";

		if (!grouped[afdeling]) grouped[afdeling] = {};
		if (!grouped[afdeling][ploeg]) grouped[afdeling][ploeg] = [];
		grouped[afdeling][ploeg].push(p);
	}
	return grouped;
}

const PersonList = ({ personnel, searchTerm, setSearchTerm, onEdit, departments = [], shiftsByDept = {}, userRole, onAssign, fixedScope }) => {
	const [selectedDept, setSelectedDept] = useState(null);
	const [collapsedShifts, setCollapsedShifts] = useState({});

	// Auto-select department if fixedScope is active
	useEffect(() => {
		if (fixedScope && departments.length > 0) {
			const dept = departments.find(d => {
				const scope = fixedScope.toLowerCase();
				return (d.slug && d.slug.toLowerCase() === scope) || 
					   (d.name && d.name.toLowerCase().includes(scope));
			});
			if (dept) setSelectedDept(dept.name);
		}
	}, [fixedScope, departments]);

	const toggleShift = (shiftLabel) => {
		setCollapsedShifts(prev => ({
			...prev,
			[shiftLabel]: !prev[shiftLabel]
		}));
	};

	const canAssign = userRole === 'admin' || userRole === 'teamleader';

	const filtered = personnel.filter((p) => {
		const term = searchTerm.toLowerCase();
		return (
			p.name?.toLowerCase().includes(term) ||
			p.employeeNumber?.toLowerCase().includes(term) ||
			p.department?.toLowerCase().includes(term) ||
			p.shift?.toLowerCase().includes(term)
		);
	});

	// Alleen Fittings, Spools, Pipes tonen als hoofdafdelingen (case-insensitive)
	const hoofdAfdelingen = ["fitting", "spool", "pipe"];
	const visibleDepartments = departments.filter((d) => {
		const name = (d.name || "").toLowerCase();
		const slug = (d.slug || "").toLowerCase();
		return hoofdAfdelingen.some((key) => name.includes(key) || slug.includes(key));
	});

	const grouped = groupByAfdelingEnPloeg(filtered, visibleDepartments, shiftsByDept);

	// Helper voor iconen en kleuren
	const getDeptStyle = (name) => {
		const n = name.toLowerCase();
		if (n.includes("fitting")) return { icon: BoxSelect, color: "text-blue-600", bg: "bg-blue-50 group-hover:bg-blue-100" };
		if (n.includes("spool")) return { icon: Layers, color: "text-purple-600", bg: "bg-purple-50 group-hover:bg-purple-100" };
		if (n.includes("pipe")) return { icon: ArrowRightLeft, color: "text-emerald-600", bg: "bg-emerald-50 group-hover:bg-emerald-100" };
		return { icon: Users, color: "text-slate-600", bg: "bg-slate-50 group-hover:bg-slate-100" };
	};

	// --- VIEW 1: TEGELS (Hoofdscherm) ---
	if (!selectedDept && !fixedScope) {
		return (
			<div className="flex flex-col items-center w-full animate-in fade-in duration-500">
				<div className="flex items-center gap-2 mb-10 w-full max-w-3xl">
					<input
						type="text"
						placeholder="Zoek personeel over alle afdelingen..."
						className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 transition-all shadow-sm font-bold text-slate-700"
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
					/>
				</div>

				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full px-6">
					{visibleDepartments.map((dept) => {
						const style = getDeptStyle(dept.name);
						const Icon = style.icon;
						
						// Tel aantal personen in deze afdeling (op basis van filter)
						const deptCount = Object.values(grouped[dept.name] || {})
							.reduce((acc, arr) => acc + arr.length, 0);

						return (
							<button
								key={dept.name}
								onClick={() => setSelectedDept(dept.name)}
								className="bg-white p-8 rounded-[40px] shadow-lg border-2 border-slate-100 hover:border-blue-500 hover:shadow-2xl transition-all flex flex-col items-center justify-center text-center group active:scale-95 min-h-[300px] relative overflow-hidden w-full"
							>
								<div className={`p-6 rounded-3xl transition-colors mb-6 ${style.bg} ${style.color}`}>
									<Icon size={56} strokeWidth={1.5} />
								</div>
								<h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight group-hover:text-blue-600 transition-colors">
									{dept.name}
								</h3>
								<div className="mt-4 px-4 py-1.5 bg-slate-50 rounded-full border border-slate-100">
									<span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
										{deptCount} Medewerkers
									</span>
								</div>
							</button>
						);
					})}
				</div>
			</div>
		);
	}

	// --- VIEW 2: DETAILS (Geselecteerde Afdeling) ---
	const activeDept = visibleDepartments.find(d => d.name === selectedDept);
	if (!activeDept) { 
		if (fixedScope) return null; // Wacht op auto-select
		setSelectedDept(null); 
		return null; 
	} // Fallback

	const afdeling = activeDept.name;
	const shifts = shiftsByDept[afdeling] || [];
	const style = getDeptStyle(afdeling);
	const HeaderIcon = style.icon;

	return (
		<div className="flex flex-col items-center w-full animate-in slide-in-from-right-8 duration-300">
			{/* Header met Back knop */}
			<div className="w-full px-6 flex items-center gap-4 mb-8">
				{!fixedScope && (
					<button 
						onClick={() => setSelectedDept(null)}
						className="p-4 bg-white border-2 border-slate-200 rounded-2xl hover:bg-slate-100 hover:border-slate-300 transition-all text-slate-600 shadow-sm group"
					>
						<ArrowLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
					</button>
				)}
				<div className="flex-1">
					<input
						type="text"
						placeholder={`Zoek specifiek in ${afdeling}...`}
						className="w-full p-4 bg-white border-2 border-slate-200 rounded-2xl outline-none focus:border-blue-500 transition-all shadow-sm font-bold"
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
					/>
				</div>
			</div>

			<div className="w-full px-6">
				<div className="bg-white rounded-[40px] shadow-xl border border-slate-200 overflow-hidden flex flex-col min-h-[600px]">
					<div className="bg-slate-50/50 border-b border-slate-100 px-10 py-8 flex items-center gap-6">
						<div className={`p-4 rounded-2xl ${style.bg.replace('group-hover:', '')} ${style.color}`}>
							<HeaderIcon size={32} />
						</div>
						<h3 className="font-black text-3xl text-slate-800 uppercase italic tracking-tighter">{afdeling}</h3>
					</div>
					
					<div className="p-10 flex-1 flex flex-col gap-10 bg-slate-50/30">
						{shifts.map((shift) => {
							const ploeg = shift.label;
							const personen = grouped[afdeling]?.[ploeg] || [];
							const isCollapsed = collapsedShifts[ploeg];

							return (
								<div key={ploeg} className="flex flex-col gap-5">
									<button 
										onClick={() => toggleShift(ploeg)}
										className="flex items-center gap-4 w-full text-left group/header focus:outline-none"
									>
										<div className={`p-1.5 rounded-lg bg-slate-100 text-slate-400 group-hover/header:bg-blue-50 group-hover/header:text-blue-500 transition-all ${isCollapsed ? "-rotate-90" : ""}`}>
											<ChevronDown size={16} strokeWidth={3} />
										</div>
										<span className="text-sm font-black text-slate-400 uppercase tracking-[0.2em] group-hover/header:text-blue-600 transition-colors">{ploeg}</span>
										<div className="h-0.5 bg-slate-200 flex-1 rounded-full group-hover/header:bg-blue-100 transition-colors"></div>
										<span className={`text-xs font-bold text-white px-3 py-1 rounded-full shadow-sm ${personen.length > 0 ? "bg-slate-400 group-hover/header:bg-blue-400" : "bg-slate-200"}`}>{personen.length}</span>
									</button>
									
									{!isCollapsed && (
										<div className="animate-in slide-in-from-top-4 fade-in duration-300">
											{personen.length > 0 ? (
												<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
													{personen.map((p) => (
												<div 
													key={p.id} 
													onClick={() => onEdit(p)}
													className="bg-white rounded-2xl p-4 border-2 border-slate-200 shadow-sm hover:border-blue-400 hover:shadow-md transition-all group relative overflow-hidden cursor-pointer"
												>
															<div className="flex justify-between items-start relative z-10">
																<div>
																	<div 
																		className={`font-black text-slate-800 text-base ${canAssign ? "cursor-pointer hover:text-blue-600 hover:underline decoration-2 underline-offset-2" : ""}`}
																		onClick={() => canAssign && onAssign(p)}
																		title={canAssign ? "Klik om tijdelijk te wijzigen" : ""}
																	>
																		{p.name}
																	</div>
																	{p.temporaryAssignment && (
																		(() => {
																			const today = new Date().toISOString().split('T')[0];
																			if (today >= p.temporaryAssignment.startDate && today <= p.temporaryAssignment.endDate) {
																				return (
																					<div className="flex items-center gap-1 text-[9px] font-bold text-orange-500 mt-0.5">
																						<Clock size={10} />
																						<span>Tijdelijk tot {new Date(p.temporaryAssignment.endDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</span>
																					</div>
																				);
																			}
																		})()
																	)}
																	<div className="text-xs text-slate-400 font-mono mt-1 font-bold">{p.employeeNumber}</div>
																</div>
																<button onClick={(e) => { e.stopPropagation(); onEdit(p); }} className="text-slate-300 hover:text-blue-600 transition-colors p-2 hover:bg-blue-50 rounded-xl">
																	<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
																</button>
															</div>
															<div className="mt-3 flex flex-wrap gap-2 relative z-10">
																<span className="text-[10px] bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-slate-600 font-bold uppercase tracking-wider">{p.role || "Operator"}</span>
															</div>
														</div>
													))}
												</div>
											) : (
												<div className="py-8 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50/50">
													<p className="text-[10px] font-bold text-slate-300 uppercase tracking-widest italic">Geen bezetting in {ploeg}</p>
												</div>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</div>
	);
};

export default PersonList;
