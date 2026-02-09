import React, { useState, useEffect, useMemo } from "react";
import { collection, query, orderBy, onSnapshot, doc, where, addDoc, setDoc, serverTimestamp, getDocs, writeBatch, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from "../../config/firebase";
import { PATHS, isValidPath } from "../../config/dbPaths";
import PersonList from "./PersonList";
import PersonForm from "./PersonForm";
import HoursDistributionModal from "./Modal/HoursDistributionModal";
import TemporaryAssignmentModal from "./Modal/TemporaryAssignmentModal";
import { Plus, X, Users, LayoutDashboard, BoxSelect, Layers, ArrowRightLeft, ArrowLeft, Clock, Activity, Calendar, ChevronLeft, ChevronRight, Copy, Briefcase, BarChart3, Trash2, UserCheck, UserPlus, FileDown } from "lucide-react";


const FACTORY_CONFIG_PATH = PATHS.FACTORY_CONFIG;
import { getISOWeek, getYear, format, subDays, addDays, startOfWeek, endOfWeek } from "date-fns";

// Helper voor styling (consistent met PersonList)
const getDeptStyle = (name) => {
	const n = (name || "").toLowerCase();
	if (n.includes("fitting")) return { icon: BoxSelect, color: "text-blue-600", bg: "bg-blue-50 group-hover:bg-blue-100" };
	if (n.includes("spool")) return { icon: Layers, color: "text-purple-600", bg: "bg-purple-50 group-hover:bg-purple-100" };
	if (n.includes("pipe")) return { icon: ArrowRightLeft, color: "text-emerald-600", bg: "bg-emerald-50 group-hover:bg-emerald-100" };
	return { icon: Users, color: "text-slate-600", bg: "bg-slate-50 group-hover:bg-slate-100" };
};

// Helper om te checken of een shift momenteel actief is
const isShiftActive = (shiftLabel) => {
	const now = new Date();
	const currentHour = now.getHours();
	const currentMinute = now.getMinutes();
	const currentTime = currentHour * 60 + currentMinute;
	
	const label = (shiftLabel || "").toUpperCase();
	
	// Ochtend: 05:30 - 14:00
	if (label.includes("OCHTEND") || label.includes("MORNING") || label.includes("EARLY")) {
		const startTime = 5 * 60 + 30; 
		const endTime = 14 * 60; 
		return currentTime >= startTime && currentTime < endTime;
	}
	
	// Avond: 14:00 - 22:30
	if (label.includes("AVOND") || label.includes("EVENING") || label.includes("LATE")) {
		const startTime = 14 * 60; 
		const endTime = 22 * 60 + 30; 
		return currentTime >= startTime && currentTime < endTime;
	}
	
	// Nacht: 22:30 - 05:30 (over middernacht heen)
	if (label.includes("NACHT") || label.includes("NIGHT")) {
		const startTime = 22 * 60 + 30; 
		const endTime = 5 * 60 + 30; 
		return currentTime >= startTime || currentTime < endTime;
	}
	
	// Dag: 07:15 - 16:00
	if (label.includes("DAG") || label === "DAGDIENST") {
		const startTime = 7 * 60 + 15; 
		const endTime = 16 * 60; 
		return currentTime >= startTime && currentTime < endTime;
	}
	
	return true; // Fallback als shift onbekend is
};

export const StationsOverview = ({ departments, occupancy = [], weekOccupancy = [], onAddPerson, onRemovePerson, selectedDate, onDateChange, onCopyPrevious, fixedScope }) => {
	const [selectedDept, setSelectedDept] = useState(null);

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

	const hoofdAfdelingen = ["fitting", "spool", "pipe"];
	const visibleDepartments = departments.filter((d) => {
		const name = (d.name || "").toLowerCase();
		const slug = (d.slug || "").toLowerCase();
		return hoofdAfdelingen.some((key) => name.includes(key) || slug.includes(key));
	});

	if (selectedDept) {
		const dept = visibleDepartments.find((d) => d.name === selectedDept);
		if (!dept) {
			setSelectedDept(null);
			return null;
		}
		const style = getDeptStyle(dept.name);
		const HeaderIcon = style.icon;

		// KPI Berekening
		const filterOccupancy = (occList) => occList.filter(o => {
			if (dept.id && o.departmentId) return o.departmentId === dept.id;
			const oDept = (o.department || "").toLowerCase();
			const dName = (dept.name || "").toLowerCase();
			return oDept === dName || oDept.includes(dName) || dName.includes(oDept);
		});

		const deptOccupancy = filterOccupancy(occupancy);
		const deptWeekOccupancy = filterOccupancy(weekOccupancy);

		// Helper voor uren berekening (gebruik 'hours' veld of fallback naar 8)
		const calcHours = (list) => list.reduce((acc, o) => acc + (parseFloat(o.hoursWorked || o.hours) || 8), 0);

		const totalHours = calcHours(deptOccupancy);
		const totalWeekHours = calcHours(deptWeekOccupancy);
		
		let productionHours = 0;
		let productionWeekHours = 0;
		const deptNameLower = dept.name.toLowerCase();
		let productionLabel = "";

		if (deptNameLower.includes("fitting")) {
			const isProd = (o) => {
				const name = (o.machineName || o.machineId || "").toUpperCase();
				return name.includes("BH") || name.includes("MAZAK") || name.includes("NABEWERK");
			};
			productionHours = calcHours(deptOccupancy.filter(isProd));
			productionWeekHours = calcHours(deptWeekOccupancy.filter(isProd));
			productionLabel = "BH";
		} else if (deptNameLower.includes("pipe")) {
			const isProd = (o) => (o.machineName || "").toUpperCase().includes("BA");
			productionHours = calcHours(deptOccupancy.filter(isProd));
			productionWeekHours = calcHours(deptWeekOccupancy.filter(isProd));
			productionLabel = "BA";
		}

		// KPI 3: Support Uren (Totaal - Productie)
		const supportHours = totalHours - productionHours;
		const supportWeekHours = totalWeekHours - productionWeekHours;

		// KPI 4: Bezetting % (Actieve stations / Totaal stations)
		const totalStations = (dept.stations || []).length;
		
		// Unieke stations tellen (voorkom dubbeltelling bij meerdere operators op 1 station)
		const activeStationsSet = new Set(deptOccupancy.map(o => o.machineId || o.machineName));
		const activeCount = activeStationsSet.size;
		const occupancyRate = totalStations > 0 ? Math.round((activeCount / totalStations) * 100) : 0;
		
		const uniqueDays = new Set(weekOccupancy.map(o => o.date)).size || 1;
		const stationsPerDay = weekOccupancy.reduce((acc, o) => {
			if (!acc[o.date]) acc[o.date] = new Set();
			acc[o.date].add(o.machineId || o.machineName);
			return acc;
		}, {});
		const totalActiveStationDays = Object.values(stationsPerDay).reduce((sum, set) => sum + set.size, 0);
		const avgActivePerDay = uniqueDays > 0 ? totalActiveStationDays / uniqueDays : 0;
		const weekOccupancyRate = totalStations > 0 ? Math.round((avgActivePerDay / totalStations) * 100) : 0;

		const handleExport = (period) => {
			const data = period === 'week' ? deptWeekOccupancy : deptOccupancy;
			if (!data || data.length === 0) {
				alert("Geen data om te exporteren.");
				return;
			}

			const headers = ["Datum", "Afdeling", "Station", "Operator", "Personeelsnr", "Ploeg", "Uren"];
			const rows = data.map(item => [
				item.date,
				dept.name,
				item.machineName || item.machineId,
				item.operatorName,
				item.operatorNumber || "",
				item.shift || "",
				item.hoursWorked || item.hours || 8
			]);

			const csvContent = "data:text/csv;charset=utf-8," 
				+ [headers.join(";"), ...rows.map(e => e.join(";"))].join("\n");

			const encodedUri = encodeURI(csvContent);
			const link = document.createElement("a");
			link.setAttribute("href", encodedUri);
			link.setAttribute("download", `bezetting_${dept.name}_${period}_${format(selectedDate, 'yyyy-MM-dd')}.csv`);
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		};

		return (
			<div className="w-full px-6 animate-in slide-in-from-right-8 duration-300">
				{!fixedScope && (
					<button
						onClick={() => setSelectedDept(null)}
						className="mb-6 flex items-center gap-2 text-slate-500 hover:text-blue-600 transition-colors font-bold uppercase text-xs tracking-widest"
					>
						<ArrowLeft size={16} /> Terug naar overzicht
					</button>
				)}

				<div className="bg-white rounded-[40px] shadow-xl border border-slate-200 overflow-hidden">
					<div className="bg-slate-50/50 border-b border-slate-100 px-8 py-6">
						<div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-6">
							{/* Titel & Datum Controls */}
							<div className="flex items-center gap-6">
								<div className={`p-4 rounded-2xl ${style.bg} ${style.color}`}>
									<HeaderIcon size={32} />
								</div>
								<div>
									<h3 className="font-black text-3xl text-slate-800 uppercase italic tracking-tighter">
										{dept.name}
									</h3>
									<div className="flex flex-wrap items-center gap-4 mt-2">
										<div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
											<button onClick={() => onDateChange(subDays(selectedDate, 1))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition-all">
												<ChevronLeft size={16} />
											</button>
											<div className="px-4 text-sm font-black text-slate-700 flex items-center gap-2 min-w-[140px] justify-center">
												<Calendar size={14} className="text-slate-400" />
												{format(selectedDate, 'dd MMM yyyy')}
											</div>
											<button onClick={() => onDateChange(addDays(selectedDate, 1))} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-blue-600 transition-all">
												<ChevronRight size={16} />
											</button>
										</div>
										<div className="flex items-center gap-2">
											<button 
												onClick={() => handleExport('day')}
												className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-emerald-100 shadow-sm active:scale-95"
												title="Export Dag naar Excel"
											>
												<FileDown size={14} /> <span className="hidden sm:inline">Dag</span>
											</button>
											<button 
												onClick={() => handleExport('week')}
												className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-emerald-100 shadow-sm active:scale-95"
												title="Export Week naar Excel"
											>
												<FileDown size={14} /> <span className="hidden sm:inline">Week</span>
											</button>
										</div>
										<button 
											onClick={onCopyPrevious}
											className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-blue-100 shadow-sm active:scale-95"
											title="Kopieer bezetting van gisteren"
										>
											<Copy size={14} /> <span className="hidden sm:inline">Kopieer Gisteren</span>
										</button>
									</div>
								</div>
							</div>

							{/* KPI Tegels (Rechts) */}
							<div className="grid grid-cols-2 xl:grid-cols-4 gap-4 w-full xl:w-auto mt-6 xl:mt-0">
								{/* KPI 1: Totaal */}
								<div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
									<div className="p-2 bg-blue-50 text-blue-600 rounded-xl"><Clock size={20} /></div>
									<div>
										<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Totaal Uren</p>
										<p className="text-lg font-black text-slate-800 leading-none mt-0.5">{totalHours}u <span className="text-[10px] text-slate-400 font-bold">dag</span></p>
										<p className="text-[10px] font-bold text-slate-500 mt-0.5">{totalWeekHours}u <span className="text-[9px] text-slate-400">week</span></p>
									</div>
								</div>

								{/* KPI 2: Productie */}
								<div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
									<div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl"><Activity size={20} /></div>
									<div>
										<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Productie {productionLabel ? `(${productionLabel})` : ""}</p>
										<p className="text-lg font-black text-slate-800 leading-none mt-0.5">{productionHours}u <span className="text-[10px] text-slate-400 font-bold">dag</span></p>
										<p className="text-[10px] font-bold text-slate-500 mt-0.5">{productionWeekHours}u <span className="text-[9px] text-slate-400">week</span></p>
									</div>
								</div>

								{/* KPI 3: Support */}
								<div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
									<div className="p-2 bg-orange-50 text-orange-600 rounded-xl"><Briefcase size={20} /></div>
									<div>
										<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Support</p>
										<p className="text-lg font-black text-slate-800 leading-none mt-0.5">{supportHours}u <span className="text-[10px] text-slate-400 font-bold">dag</span></p>
										<p className="text-[10px] font-bold text-slate-500 mt-0.5">{supportWeekHours}u <span className="text-[9px] text-slate-400">week</span></p>
									</div>
								</div>

								{/* KPI 4: Bezetting */}
								<div className="bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3">
									<div className="p-2 bg-purple-50 text-purple-600 rounded-xl"><BarChart3 size={20} /></div>
									<div>
										<p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Bezetting</p>
										<p className="text-lg font-black text-slate-800 leading-none mt-0.5">{occupancyRate}% <span className="text-[10px] text-slate-400 font-bold">dag</span></p>
										<p className="text-[10px] font-bold text-slate-500 mt-0.5">{weekOccupancyRate}% <span className="text-[9px] text-slate-400">week</span></p>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div className="p-10 bg-slate-50/30 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{(dept.stations || []).map((station) => {
							const stationOccupancies = occupancy.filter(o => 
								(o.machineId === station.id || o.machineId === station.name)
							);
							const isActive = stationOccupancies.length > 0;
							
							const isTeamleaderStation = station.name.toLowerCase().includes("teamleader") || station.name.toLowerCase().includes("tl");

							return (
							<div
								key={station.id}
								className={`bg-white rounded-3xl p-6 border-2 flex flex-col gap-2 hover:shadow-md transition-all group ${
									isTeamleaderStation 
										? "border-purple-200 hover:border-purple-400 bg-purple-50/20" 
										: "border-slate-200 hover:border-blue-300"
								}`}
							>
								<div className="flex justify-between items-start">
									<span className={`font-black text-lg ${isTeamleaderStation ? "text-purple-800" : "text-slate-700"}`}>{station.name}</span>
									<div className="flex items-center gap-3">
										<button 
											className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all shadow-sm ${
												isTeamleaderStation 
													? "bg-purple-100 text-purple-600 hover:bg-purple-600 hover:text-white" 
													: "bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"
											}`}
											title="Personeel toevoegen"
											onClick={(e) => {
												e.stopPropagation();
												if (onAddPerson) onAddPerson(station, dept);
											}}
										>
											<Plus size={16} strokeWidth={3} />
										</button>
										<div className={`w-2.5 h-2.5 rounded-full ${isActive ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" : "bg-slate-300"}`}></div>
									</div>
								</div>
								<div className={`mt-4 pt-4 border-t flex flex-col gap-3 ${isTeamleaderStation ? "border-purple-100" : "border-slate-50"}`}>
									<div className="flex justify-between items-center">
										<span className={`text-[10px] font-bold uppercase tracking-wider ${isTeamleaderStation ? "text-purple-400" : "text-slate-400"}`}>
											{isActive ? "Operators" : "Status"}
										</span>
										<span className={`text-[10px] font-black px-2 py-1 rounded ${isActive ? "text-emerald-600 bg-emerald-50" : "text-slate-400 bg-slate-100"}`}>{isActive ? "ACTIEF" : "INACTIEF"}</span>
									</div>
									
									{isActive && (
										<div className="flex flex-col gap-2">
											{stationOccupancies.map(occ => {
												const active = isShiftActive(occ.shift);
												return (
												<div key={occ.id} className={`flex justify-between items-center p-2 rounded-lg border shadow-sm ${active ? 'bg-emerald-50/50 border-emerald-100' : 'bg-white/50 border-slate-100'}`}>
													<div className="flex flex-col">
														<div className="flex items-center gap-2">
															<span className={`text-xs font-black ${active ? 'text-emerald-900' : 'text-slate-700'}`}>{occ.operatorName}</span>
															<span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded ${active ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
																{active ? 'Actief' : 'Inactief'}
															</span>
														</div>
														<div className="flex items-center gap-1 text-[9px] text-slate-400 font-bold">
															{(occ.hoursWorked || occ.hours) && <span>{occ.hoursWorked || occ.hours}u</span>}
															<span>•</span>
															<span>{occ.shift || "Dagdienst"}</span>
														</div>
													</div>
													<button 
														onClick={(e) => {
															e.stopPropagation();
															if (onRemovePerson) onRemovePerson(occ.id);
														}}
														className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
														title="Verwijderen"
													>
														<X size={14} strokeWidth={3} />
													</button>
												</div>
												);
											})}
										</div>
									)}
								</div>
							</div>
						)})}
						{(dept.stations || []).length === 0 && (
							<div className="col-span-full text-center py-20 opacity-40">
								<LayoutDashboard size={48} className="mx-auto mb-4 text-slate-300" />
								<p className="text-sm font-black text-slate-400 uppercase tracking-widest">
									Geen stations gevonden
								</p>
							</div>
						)}
					</div>
				</div>
			</div>
		);
	}

	if (fixedScope) return null; // Wacht op auto-select of toon niets als scope vaststaat

	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full px-6 animate-in fade-in">
			{visibleDepartments.map((dept) => {
				const style = getDeptStyle(dept.name);
				const Icon = style.icon;
				
				return (
					<button
						key={dept.name}
						onClick={() => setSelectedDept(dept.name)}
						className="bg-white p-8 rounded-[40px] shadow-lg border-2 border-slate-100 hover:border-blue-500 transition-all flex flex-col items-center justify-center text-center group min-h-[300px] relative overflow-hidden cursor-pointer active:scale-95 w-full"
					>
						<div className={`p-6 rounded-3xl transition-colors mb-6 ${style.bg} ${style.color}`}>
							<Icon size={56} strokeWidth={1.5} />
						</div>
						<h3 className="text-2xl font-black text-slate-800 uppercase italic tracking-tight group-hover:text-blue-600 transition-colors">
							{dept.name}
						</h3>
						<div className="mt-4 px-4 py-1.5 bg-slate-50 rounded-full border border-slate-100">
							<span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
								{(dept.stations || []).length} Stations
							</span>
						</div>
					</button>
				);
			})}
		</div>
	);
};

const PersonSelectorModal = ({ station, department, personnel, departments = [], onClose, onSelect }) => {
	const [activeTab, setActiveTab] = useState("standard"); // 'standard' | 'borrowed'
	const today = new Date().toISOString().split('T')[0];

	// 1. Iedereen die NU in deze afdeling mag werken
	const availablePersonnel = personnel.filter(p => {
		let activeDeptId = p.departmentId;

		// Check tijdelijke toewijzing (datum check voor automatisch verloop)
		if (p.temporaryAssignment) {
			if (today >= p.temporaryAssignment.startDate && today <= p.temporaryAssignment.endDate) {
				activeDeptId = p.temporaryAssignment.departmentId;
			}
		}

		// Check op ID (voorkeur) of Naam
		if (department.id && activeDeptId) return activeDeptId === department.id;
		// Fallback op naam match (case insensitive voor zekerheid)
		return (p.department || "").toLowerCase() === (department.name || "").toLowerCase();
	});

	// 2. Splitsen in Vaste Kern vs Ingeleend
	const standardTeam = availablePersonnel.filter(p => p.departmentId === department.id);
	const borrowedTeam = availablePersonnel.filter(p => p.departmentId !== department.id);

	const currentList = activeTab === "standard" ? standardTeam : borrowedTeam;

	// 3. Groeperen per ploeg
	const grouped = currentList.reduce((acc, p) => {
		let shift = p.shift || "Onbekend";

		// Als tijdelijk toegewezen, gebruik de shift van de toewijzing
		if (p.temporaryAssignment && today >= p.temporaryAssignment.startDate && today <= p.temporaryAssignment.endDate) {
			const tempDept = departments.find(d => d.id === p.temporaryAssignment.departmentId);
			const tempShift = tempDept?.shifts?.find(s => s.id === p.temporaryAssignment.shiftId);
			if (tempShift) shift = tempShift.label;
		}

		if (!acc[shift]) acc[shift] = [];
		acc[shift].push(p);
		return acc;
	}, {});

	return (
		<div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
			<div className="bg-white rounded-3xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95">
				<div className="p-6 border-b border-slate-100 flex justify-between items-center">
					<div>
						<h3 className="text-xl font-black text-slate-800">Personeel Toevoegen</h3>
						<p className="text-sm text-slate-500 font-bold">Aan station: <span className="text-blue-600">{station.name}</span> ({department.name})</p>
					</div>
					<button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
				</div>

				{/* TABS */}
				<div className="flex border-b border-slate-100 px-6 gap-4">
					<button
						onClick={() => setActiveTab("standard")}
						className={`py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${
							activeTab === "standard" 
								? "border-blue-600 text-blue-600" 
								: "border-transparent text-slate-400 hover:text-slate-600"
						}`}
					>
						<UserCheck size={14} />
						Vaste Ploeg ({standardTeam.length})
					</button>
					<button
						onClick={() => setActiveTab("borrowed")}
						className={`py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2 ${
							activeTab === "borrowed" 
								? "border-orange-500 text-orange-600" 
								: "border-transparent text-slate-400 hover:text-slate-600"
						}`}
					>
						<UserPlus size={14} />
						Ingeleend ({borrowedTeam.length})
					</button>
				</div>

				<div className="p-6 overflow-y-auto custom-scrollbar">
					{Object.keys(grouped).length === 0 ? (
						<div className="text-center py-10 opacity-50">
							<Users size={48} className="mx-auto mb-3 text-slate-300" />
							<p className="text-slate-400 font-bold">Geen personeel gevonden in deze categorie.</p>
						</div>
					) : (
						Object.entries(grouped).map(([shift, persons]) => (
							<div key={shift} className="mb-6 last:mb-0">
								<h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 border-b border-slate-100 pb-1">{shift}</h4>
								<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
									{persons.map(p => (
										<button 
											key={p.id} 
											onClick={() => onSelect(p)}
											className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
										>
											<div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs group-hover:text-white transition-colors ${
												p.departmentId !== department.id 
													? "bg-orange-100 text-orange-600 group-hover:bg-orange-500" 
													: "bg-slate-100 text-slate-500 group-hover:bg-blue-600"
											}`}>
												{p.name.charAt(0)}
											</div>
											<div>
												<div className="font-bold text-slate-700 text-sm group-hover:text-blue-800">{p.name}</div>
												<div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
													{p.role}
													{p.departmentId !== department.id && (
														<span className="text-orange-500 font-bold ml-1">(Extern)</span>
													)}
												</div>
											</div>
											<Plus size={16} className="ml-auto text-slate-300 group-hover:text-blue-600" />
										</button>
									))}
								</div>
							</div>
						))
					)}
				</div>
			</div>
		</div>
	);
};

const PersonnelManager = ({ user, initialTab = "personnel", fixedScope = null }) => {
	const [personnel, setPersonnel] = useState([]);
	const [loading, setLoading] = useState(true);
	const [searchTerm, setSearchTerm] = useState("");
	const [editingPerson, setEditingPerson] = useState(null);
	const [isCreating, setIsCreating] = useState(false);
	const [departments, setDepartments] = useState([]);
	const [shiftsByDept, setShiftsByDept] = useState({});
	const [activeTab, setActiveTab] = useState(initialTab);
	const [occupancy, setOccupancy] = useState([]);
	const [users, setUsers] = useState([]);
	const [selectedDate, setSelectedDate] = useState(new Date());
	const [weekOccupancy, setWeekOccupancy] = useState([]);
	const [stationForAdd, setStationForAdd] = useState(null);
	const [conflictData, setConflictData] = useState(null);
	const [assigningPerson, setAssigningPerson] = useState(null);

	// Filter departments based on fixedScope
	const activeDepartments = useMemo(() => {
		if (!fixedScope) return departments;
		const scope = fixedScope.toLowerCase();
		return departments.filter(d => 
			(d.slug && d.slug.toLowerCase() === scope) || 
			(d.name && d.name.toLowerCase().includes(scope))
		);
	}, [departments, fixedScope]);

	// Personeel ophalen
	useEffect(() => {
		const unsub = onSnapshot(
			query(collection(db, "future-factory", "Users", "Personnel"), orderBy("name")),
			(snap) => {
				setPersonnel(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
				setLoading(false);
			}
		);
		return () => unsub();
	}, []);

	// Factory config ophalen (afdelingen en ploegen)
	useEffect(() => {
		if (!isValidPath("FACTORY_CONFIG")) return;
		const docRef = doc(db, ...FACTORY_CONFIG_PATH);
		const unsub = onSnapshot(docRef, (docSnap) => {
			if (docSnap.exists()) {
				const data = docSnap.data();
				setDepartments(Array.isArray(data.departments) ? data.departments : []);
				// shiftsByDept: { [afdelingId]: [shifts] }
				const shifts = {};
				(data.departments || []).forEach((dept) => {
					shifts[dept.name] = dept.shifts || [];
				});
				setShiftsByDept(shifts);
			} else {
				setDepartments([]);
				setShiftsByDept({});
			}
		});
		return () => unsub();
	}, []);

	// Occupancy ophalen (geselecteerde dag)
	useEffect(() => {
		if (!isValidPath("OCCUPANCY")) return;
		
		const dateStr = format(selectedDate, 'yyyy-MM-dd');
		const q = query(
			collection(db, ...PATHS.OCCUPANCY), 
			where("date", "==", dateStr)
		);

		const unsub = onSnapshot(q, (snap) => {
			setOccupancy(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
		});
		return () => unsub();
	}, [selectedDate]);

	// Occupancy ophalen (hele week) voor KPI's
	useEffect(() => {
		if (!isValidPath("OCCUPANCY")) return;
		
		const start = format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
		const end = format(endOfWeek(selectedDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
		
		const q = query(
			collection(db, ...PATHS.OCCUPANCY), 
			where("date", ">=", start),
			where("date", "<=", end)
		);

		const unsub = onSnapshot(q, (snap) => {
			setWeekOccupancy(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
		});
		return () => unsub();
	}, [selectedDate]);

	// Users ophalen voor koppeling (Teamleaders etc.)
	useEffect(() => {
		const unsub = onSnapshot(
			query(collection(db, ...PATHS.USERS), orderBy("name")),
			(snap) => {
				setUsers(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
			}
		);
		return () => unsub();
	}, []);

	// Opslaan van personeel (Nieuw of Bewerken)
	const handleSavePerson = async (personData) => {
		try {
			const collectionRef = collection(db, "future-factory", "Users", "Personnel");
			
			// Huidige week/jaar bepalen voor rotatie-anker
			const currentWeek = getISOWeek(new Date());
			const currentYear = getYear(new Date());

			// Namen resolven (voorkomt undefined errors bij editen zonder wijziging)
			const selectedDept = departments.find(d => d.id === personData.departmentId);
			const departmentName = selectedDept ? selectedDept.name : (personData.department || "Onbekend");

			let shiftName = personData.shiftName || personData.shift || "Onbekend";
			if (selectedDept && selectedDept.shifts) {
				const selectedShift = selectedDept.shifts.find(s => s.id === personData.shiftId);
				if (selectedShift) shiftName = selectedShift.label;
			}

			const dataToSave = {
				name: personData.name,
				employeeNumber: personData.employeeNumber,
				departmentId: personData.departmentId,
				department: departmentName,
				role: personData.role,
				email: personData.email || "",
				rotationType: personData.rotationType || "STATIC",
				shiftId: personData.shiftId, // Huidige ploeg (anker)
				shift: shiftName,
				startWeek: personData.resetRotation ? currentWeek : (personData.startWeek || currentWeek),
				startYear: personData.resetRotation ? currentYear : (personData.startYear || currentYear),
				linkedUserId: personData.linkedUserId || "",
				isActive: true,
				lastUpdated: serverTimestamp(),
				temporaryAssignment: personData.temporaryAssignment || null,
			};

			if (personData.id) {
				await setDoc(doc(collectionRef, personData.id), dataToSave, { merge: true });
			} else {
				await addDoc(collectionRef, dataToSave);
			}
			setEditingPerson(null);
			setIsCreating(false);
		} catch (error) {
			console.error("Fout bij opslaan:", error);
			alert("Opslaan mislukt: " + error.message);
		}
	};

	const handleAddPersonToStation = async (station, person) => {
		// Check of persoon al op DIT station zit
		const onThisStation = occupancy.find(o => o.operatorId === person.id && o.machineId === station.id);
		if (onThisStation) {
			alert(`${person.name} is al toegewezen aan ${station.name}.`);
			return;
		}

		// Check of persoon al op EEN ANDER station zit
		const otherAssignments = occupancy.filter(o => o.operatorId === person.id);
		
		if (otherAssignments.length > 0) {
			setConflictData({
				person,
				newStation: station,
				existingAssignments: otherAssignments
			});
			setStationForAdd(null); // Sluit de selector modal
			return;
		}

		try {
			const dateStr = format(selectedDate, 'yyyy-MM-dd');
			await addDoc(collection(db, ...PATHS.OCCUPANCY), {
				date: dateStr,
				machineId: station.id,
				machineName: station.name,
				operatorId: person.id,
				operatorName: person.name,
				operatorNumber: person.employeeNumber || "",
				departmentId: person.departmentId || "",
				shift: person.shift || "",
				startTime: serverTimestamp(),
				status: "active",
				hoursWorked: 8 // Standaard volledige dag
			});
			setStationForAdd(null);
		} catch (error) {
			console.error("Fout bij toevoegen aan station:", error);
			alert("Kon persoon niet toevoegen aan station.");
		}
	};

	const handleConfirmConflict = async (distributions) => {
		try {
			const batch = writeBatch(db);
			const dateStr = format(selectedDate, 'yyyy-MM-dd');

			for (const dist of distributions) {
				if (dist.isNew) {
					// Nieuwe toewijzing aanmaken
					const docRef = doc(collection(db, ...PATHS.OCCUPANCY));
					batch.set(docRef, {
						date: dateStr,
						machineId: conflictData.newStation.id,
						machineName: conflictData.newStation.name,
						operatorId: conflictData.person.id,
						operatorName: conflictData.person.name,
						operatorNumber: conflictData.person.employeeNumber || "",
						departmentId: conflictData.person.departmentId || "",
						shift: conflictData.person.shift || "",
						startTime: serverTimestamp(),
						status: "active",
						hoursWorked: dist.hours
					});
				} else {
					// Bestaande updaten
					const docRef = doc(db, ...PATHS.OCCUPANCY, dist.id);
					batch.update(docRef, { hoursWorked: dist.hours });
				}
			}
			
			await batch.commit();
			setConflictData(null);
		} catch (error) {
			console.error("Fout bij verdelen uren:", error);
			alert("Kon uren niet verdelen.");
		}
	};

	const handleSaveAssignment = async (personId, assignmentData) => {
		try {
			const docRef = doc(db, "future-factory", "Users", "Personnel", personId);
			await updateDoc(docRef, {
				temporaryAssignment: assignmentData,
				lastUpdated: serverTimestamp()
			});
			setAssigningPerson(null);
			alert("Tijdelijke wijziging opgeslagen.");
		} catch (error) {
			console.error("Error saving assignment:", error);
			alert("Fout bij opslaan.");
		}
	};

	const handleCopyPreviousDay = async () => {
		if (!window.confirm("Weet je zeker dat je de planning van de vorige dag wilt overnemen?")) return;
		
		const prevDateStr = format(subDays(selectedDate, 1), 'yyyy-MM-dd');
		const currentDateStr = format(selectedDate, 'yyyy-MM-dd');
		
		try {
			const q = query(collection(db, ...PATHS.OCCUPANCY), where("date", "==", prevDateStr));
			const snapshot = await getDocs(q);
			
			if (snapshot.empty) {
				alert("Geen planning gevonden voor de vorige dag.");
				return;
			}

			const batch = writeBatch(db);
			let count = 0;

			snapshot.docs.forEach(docSnap => {
				const data = docSnap.data();
				const newRef = doc(collection(db, ...PATHS.OCCUPANCY));
				batch.set(newRef, { ...data, date: currentDateStr, startTime: serverTimestamp(), copiedFrom: prevDateStr });
				count++;
			});

			await batch.commit();
			alert(`${count} toewijzingen gekopieerd naar ${currentDateStr}.`);
		} catch (error) {
			console.error("Fout bij kopiëren:", error);
			alert("Er ging iets mis bij het kopiëren.");
		}
	};

	const handleRemovePersonFromStation = async (occupancyId) => {
		if (!window.confirm("Weet je zeker dat je deze operator wilt verwijderen van het station?")) return;
		try {
			await deleteDoc(doc(db, ...PATHS.OCCUPANCY, occupancyId));
		} catch (error) {
			console.error("Fout bij verwijderen van station:", error);
			alert("Kon operator niet verwijderen.");
		}
	};

	if (loading) return <div>Laden...</div>;

	return (
		<div className="flex flex-col items-center w-full">
			<div className="w-full flex flex-col md:flex-row justify-center items-center mb-10 relative gap-4 px-6">
				{/* Tabs Centraal */}
				<div className="flex bg-slate-100 p-1.5 rounded-2xl shadow-inner">
					<button 
						onClick={() => setActiveTab("personnel")}
						className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "personnel" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
					>
						<Users size={16} /> Personeel
					</button>
					<button 
						onClick={() => setActiveTab("stations")}
						className={`px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "stations" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
					>
						<LayoutDashboard size={16} /> Stations
					</button>
				</div>

				{activeTab === "personnel" && (
					<div className="md:absolute md:right-6">
					<button
						onClick={() => setIsCreating(true)}
						className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg"
					>
						<Plus size={16} /> Nieuw Personeelslid
					</button>
					</div>
				)}
			</div>

			{activeTab === "personnel" ? (
				<PersonList
					personnel={personnel}
					searchTerm={searchTerm}
					setSearchTerm={setSearchTerm}
					onEdit={setEditingPerson}
					departments={activeDepartments}
					shiftsByDept={shiftsByDept}
					userRole={user?.role}
					onAssign={setAssigningPerson}
					fixedScope={fixedScope}
				/>
			) : (
				<StationsOverview 
					departments={activeDepartments} 
					occupancy={occupancy} 
					weekOccupancy={weekOccupancy}
					selectedDate={selectedDate}
					onDateChange={setSelectedDate}
					onCopyPrevious={handleCopyPreviousDay}
					onAddPerson={(station, dept) => setStationForAdd({ station, dept })}
					onRemovePerson={handleRemovePersonFromStation}
					fixedScope={fixedScope}
				/>
			)}

			{(isCreating || editingPerson) && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
					<div className="bg-white rounded-3xl p-8 w-full max-w-lg shadow-2xl relative animate-in zoom-in-95">
						<button
							onClick={() => { setIsCreating(false); setEditingPerson(null); }}
							className="absolute top-4 right-4 p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all"
						>
							<X size={20} />
						</button>
						<h3 className="text-xl font-black text-slate-800 mb-6 uppercase italic tracking-tight">
							{editingPerson ? "Personeel Bewerken" : "Nieuw Personeelslid"}
						</h3>
						<PersonForm
							person={editingPerson}
							departments={departments}
							users={users}
							onSave={handleSavePerson}
						/>
					</div>
				</div>
			)}

			{stationForAdd && (
				<PersonSelectorModal 
					station={stationForAdd.station}
					department={stationForAdd.dept}
					personnel={personnel}
					departments={departments}
					onClose={() => setStationForAdd(null)}
					onSelect={(person) => handleAddPersonToStation(stationForAdd.station, person)}
				/>
			)}

			{conflictData && (
				<HoursDistributionModal 
					data={conflictData}
					onClose={() => setConflictData(null)}
					onConfirm={handleConfirmConflict}
				/>
			)}

			{assigningPerson && (
				<TemporaryAssignmentModal 
					person={assigningPerson}
					departments={departments}
					onClose={() => setAssigningPerson(null)}
					onSave={handleSaveAssignment}
				/>
			)}
		</div>
	);
};

export default PersonnelManager;
