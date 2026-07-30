export interface Wm186DTarget {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  asconf: string;
}

export interface Wm18StationTargets {
  pos1: Wm186DTarget;
  pos2: Wm186DTarget;
  pos3: Wm186DTarget;
  pos4: Wm186DTarget;
  pos5: Wm186DTarget;
  toPipe: Wm186DTarget;
}

export interface Wm18SpeedsAndPitches {
  windingSpeedRpm: number;
  speedPercentage: number;
  pitchMof1Mm: number;
  pitchBochtMm: number;
  pitchMof2Mm: number;
  pitchNonWovenMm: number;
  movingSpeedMof1MmSec: number;
  movingSpeedBochtMmSec: number;
  movingSpeedMof2MmSec: number;
  movingSpeedNonWovenMmSec: number;
}

export interface Wm18CatalogItem {
  id: string;
  articleNumber: string;
  diameterMm: number;
  mofType: 'TB' | 'CB' | string;
  series: 'EST' | 'EMT' | 'FIBERMAR' | 'CST' | string;
  pressureClass: string;
  angleDeg: number;
  radiusMm: number | null;
  twMm: number;
  mofLengteLnomMm: number;
  weightKg: number;
  bdMm: number;
  vrijgaveStn1: boolean;
  vrijgaveStn2: boolean;
  stn1Targets: Wm18StationTargets;
  stn2Targets: Wm18StationTargets;
  speedsAndPitches: Wm18SpeedsAndPitches;
  gangenCount: number;
  wikkeltijdMin: number;
  fabricMeters: number;
  sourceFileName?: string;
  sourceSheet?: string;
  notes?: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface Wm18OperatorAdjustment {
  id: string;
  datum: string;
  operatorName: string;
  diameterMm: number;
  mofType: string;
  series: string;
  pressureClass: string;
  angleDeg: number;
  radiusMm: number | null;
  opmerking: string;
  status: 'NIEUW' | 'EXTRA GANG' | 'GEWIJZIGD' | 'VERWERKT' | string;
  verwerktDatum?: string;
}

export interface Wm18RapidModuleOutput {
  stn1RapidCode: string;
  stn2RapidCode: string;
  generatedAt: string;
  productDescription: string;
}
