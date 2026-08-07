import * as React from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  Cpu,
  Factory,
  Monitor,
  ShieldCheck,
  Wrench,
} from "lucide-react";

export type DepartmentStyle = {
  icon: React.ReactNode;
  color: string;
  iconColor: string;
};

export const STYLE_PALETTE: DepartmentStyle[] = [
  { icon: <Factory size={40} />, color: "#EEF2FF", iconColor: "#4338CA" },
  { icon: <Wrench size={40} />, color: "#FFE4E6", iconColor: "#BE123C" },
  { icon: <Boxes size={40} />, color: "#CCFBF1", iconColor: "#0F766E" },
  { icon: <ShieldCheck size={40} />, color: "#FEF3C7", iconColor: "#B45309" },
  { icon: <Cpu size={40} />, color: "#E0F2FE", iconColor: "#075985" },
  { icon: <Activity size={40} />, color: "#ECFCCB", iconColor: "#3F6212" },
];

export const normalizeKey = (value: string | undefined | null): string =>
  String(value || "")
    .toLowerCase()
    .replace(/[\s_-]+/g, "");

export const getDepartmentStyle = (
  department: { name?: string; slug?: string; id?: string },
  fallbackIndex: number
): DepartmentStyle => {
  const key = normalizeKey(`${department.name || ""} ${department.slug || ""} ${department.id || ""}`);
  
  if (key.includes("fitting")) {
    return { icon: <Monitor size={40} />, color: "#DCFCE7", iconColor: "#047857" };
  }
  if (key.includes("pipe") || key.includes("buis")) {
    return { icon: <Cpu size={40} />, color: "#FFEDD5", iconColor: "#C2410C" };
  }
  if (key.includes("spool")) {
    return { icon: <Activity size={40} />, color: "#F3E8FF", iconColor: "#6D28D9" };
  }
  if (key === "qc" || key.includes("quality") || key.includes("kwaliteit")) {
    return { icon: <AlertTriangle size={40} />, color: "#CFFAFE", iconColor: "#0E7490" };
  }
  
  const paletteIndex = fallbackIndex % STYLE_PALETTE.length;
  return STYLE_PALETTE[paletteIndex];
};
