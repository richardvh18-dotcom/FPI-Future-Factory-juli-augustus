import { Wm18CatalogItem, Wm186DTarget, Wm18StationTargets, Wm18SpeedsAndPitches, Wm18RapidModuleOutput } from '../types/wm18Types';

export interface Wm18CalculationInput {
  articleNumber?: string;
  diameterMm: number; // C
  mofType: 'TB' | 'CB' | string; // D
  series: string; // E
  pressureClass: string; // F
  angleDeg: number; // G
  radiusMm?: number | null; // L (or derived from 1.5 * diameter)
  radiusType?: string; // H (e.g. "1½ ID")
  twMm?: number; // I (Wall thickness)
  moflengteLnomMm?: number; // J
  moflengteKmm?: number; // K
  weightKg?: number; // M
  cOfMm?: number; // N
  bdMm?: number; // O
  lNulpuntAjMm?: number; // AJ
  lNulpuntAkMm?: number; // AK
  speedPercentage?: number; // AE (default 110%)
  layerThicknessMm?: number; // AF (default 1)
  agMm?: number; // AG (default -10)
  ahMm?: number; // AH (default 0)
  aiMm?: number; // AI (default 0)
  pitchMof1Mm?: number; // AA (default 33)
  pitchBochtMm?: number; // AB (default 33)
  pitchMof2Mm?: number; // AC (default 33)
  pitchNonWovenMm?: number; // AD (default 20)
  offsetStn1?: { x: number; y: number; z: number; ry: number };
  offsetStn2?: { x: number; y: number; z: number; ry: number };
}

const toRadians = (deg: number) => (deg * Math.PI) / 180;

export const calculateWm18Item = (input: Wm18CalculationInput): Wm18CatalogItem => {
  const diameter = Number(input.diameterMm) || 250;
  const angle = Number(input.angleDeg) || 90;
  const mofType = String(input.mofType || 'TB').toUpperCase();
  const series = String(input.series || 'EST').toUpperCase();
  const pressureClass = String(input.pressureClass || 'PN16').toUpperCase();

  const radiusL = input.radiusMm ? Number(input.radiusMm) : 1.5 * diameter;
  const tw = input.twMm ? Number(input.twMm) : 4.5;
  const jVal = input.moflengteLnomMm ? Number(input.moflengteLnomMm) : 40;
  const kVal = input.moflengteKmm ? Number(input.moflengteKmm) : 100;
  const nVal = input.cOfMm ? Number(input.cOfMm) : 1.5;

  const aj = input.lNulpuntAjMm ? Number(input.lNulpuntAjMm) : 180;
  const ak = input.lNulpuntAkMm !== undefined ? Number(input.lNulpuntAkMm) : 0;
  const au = aj + ak; // AU: L nulpunt tot stootneus

  const speedPercentage = input.speedPercentage ? Number(input.speedPercentage) : 110;
  const layerThickness = input.layerThicknessMm ? Number(input.layerThicknessMm) : 1;
  const ag = input.agMm !== undefined ? Number(input.agMm) : -10;
  const ah = input.ahMm !== undefined ? Number(input.ahMm) : 0;
  const ai = input.aiMm !== undefined ? Number(input.aiMm) : 0;

  const aa = input.pitchMof1Mm ? Number(input.pitchMof1Mm) : 33;
  const ab = input.pitchBochtMm ? Number(input.pitchBochtMm) : 33;
  const ac = input.pitchMof2Mm ? Number(input.pitchMof2Mm) : 33;
  const ad = input.pitchNonWovenMm ? Number(input.pitchNonWovenMm) : 20;

  const av = Math.ceil(tw / Math.max(0.1, layerThickness)); // Gangen
  const aw = Math.floor(mofType === 'CB' ? kVal - jVal - nVal + 1 : kVal - jVal + nVal); // AW: Mof lengte
  const ax = (2 * radiusL + diameter) * Math.PI * (angle / 360); // AX: Bochtmal lengte

  const windingRpm = (speedPercentage / 100) * 34; // BA: Winding speed omw/min
  const bb = (windingRpm / 60) * aa; // BB: MovingSpeed Mof 1
  const bc = (windingRpm / 60) * ac; // BC: MovingSpeed Mof 2

  const radiusType = input.radiusType || '1½ ID';
  const bd = radiusType === '1½ ID'
    ? ((diameter * 1.5) / (2 * diameter + ai)) * ab
    : ((diameter * 1) / (1.5 * diameter + ai)) * ab; // BD: Spoed weefsel bocht
  const be = (windingRpm / 60) * bd; // BE: MovingSpeed Bocht

  const bf = radiusType === '1½ ID'
    ? ((diameter * 1.5) / (2 * diameter)) * ad
    : ((diameter * 1) / (1.5 * diameter)) * ad; // BF: Spoed Non-woven
  const bg = (windingRpm / 60) * bf; // BG: MovingSpeed Non-woven

  const ay = Math.ceil((((aw / aa + ax / ab + aw / ac) * av) * (Math.PI * (diameter + tw))) / 1000); // AY: Weefsel benodigd in meters
  const az = Math.round((av * ((aw - ag) / Math.max(0.1, bb)) + av * ((2 * Math.PI * radiusL * (angle / 360)) / Math.max(0.1, be)) + av * ((aw - ag) / Math.max(0.1, bc))) / 60 * 10) / 10; // AZ: Wikkeltijd in minuten

  // 6D Spatial Targets calculations for STN 1 & STN 2
  const calcPos1 = (stn: 1 | 2): Wm186DTarget => {
    const rx = stn === 1 ? -30 : 30;
    const ry = 90;
    const rz = 180;
    const x = stn === 1 ? 0 + ai : 0;
    const y = 0;
    const z = au - aw + 0.5 * ag;
    return {
      x: Math.round(x * 10) / 10,
      y,
      z: Math.round(z * 10) / 10,
      rx, ry, rz,
      asconf: stn === 1 ? '[-1,-1,-1,0]' : '[0,0,0,0]',
    };
  };

  const calcPos2 = (stn: 1 | 2): Wm186DTarget => {
    const p1 = calcPos1(stn);
    return {
      ...p1,
      z: Math.round(au * 10) / 10,
    };
  };

  const calcPos3 = (stn: 1 | 2): Wm186DTarget => {
    const p2 = calcPos2(stn);
    const radHalfQuarter = toRadians(angle / 4);
    const x = p2.x + Math.sin(radHalfQuarter) * 2 * (radiusL - ai) * Math.sin(radHalfQuarter);
    const z = au + Math.cos(radHalfQuarter) * 2 * (radiusL - ai) * Math.sin(radHalfQuarter);
    const ry = 90 - angle / 2;
    return {
      x: Math.round(x * 10) / 10,
      y: 0,
      z: Math.round(z * 10) / 10,
      rx: stn === 1 ? -30 : 30,
      ry: Math.round(ry * 1000) / 1000,
      rz: 180,
      asconf: stn === 1 ? '[-1,-1,-1,0]' : '[0,0,0,0]',
    };
  };

  const calcPos4 = (stn: 1 | 2): Wm186DTarget => {
    const p1 = calcPos1(stn);
    const radHalf = toRadians(angle / 2);
    const x = p1.x + Math.sin(radHalf) * 2 * (radiusL - ai) * Math.sin(radHalf);
    const z = au + Math.cos(radHalf) * 2 * (radiusL - ai) * Math.sin(radHalf);
    const ry = 90 - angle;
    return {
      x: Math.round(x * 10) / 10,
      y: 0,
      z: Math.round(z * 10) / 10,
      rx: stn === 1 ? -30 : 30,
      ry: Math.round(ry * 1000) / 1000,
      rz: 180,
      asconf: stn === 1 ? '[-1,-1,-1,0]' : '[0,0,0,0]',
    };
  };

  const calcPos5 = (stn: 1 | 2): Wm186DTarget => {
    const p4 = calcPos4(stn);
    const radAngle = toRadians(angle);
    const x = p4.x + Math.sin(radAngle) * (aw - 0.5 * ag);
    const z = p4.z + Math.cos(radAngle) * (aw - 0.5 * ag);
    return {
      ...p4,
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
    };
  };

  const calcPos6 = (stn: 1 | 2): Wm186DTarget => {
    const p5 = calcPos5(stn);
    const radAngle = toRadians(angle);
    const x = p5.x + Math.sin(radAngle) * ah;
    const z = p5.z + Math.cos(radAngle) * ah;
    return {
      ...p5,
      x: Math.round(x * 10) / 10,
      z: Math.round(z * 10) / 10,
    };
  };

  const stn1Targets: Wm18StationTargets = {
    pos1: calcPos1(1),
    pos2: calcPos2(1),
    pos3: calcPos3(1),
    pos4: calcPos4(1),
    pos5: calcPos5(1),
    toPipe: calcPos6(1),
  };

  const stn2Targets: Wm18StationTargets = {
    pos1: calcPos1(2),
    pos2: calcPos2(2),
    pos3: calcPos3(2),
    pos4: calcPos4(2),
    pos5: calcPos5(2),
    toPipe: calcPos6(2),
  };

  const rawArticleNumber = input.articleNumber ? String(input.articleNumber).trim() : '';
  const articleNumber = rawArticleNumber || `ELM0XSS_${diameter}_${mofType}_${angle}DEG_${series}`;
  const itemId = rawArticleNumber || `wm18_${diameter}_${mofType.toLowerCase()}_${angle}_${series.toLowerCase()}`;

  return {
    id: itemId,
    articleNumber,
    diameterMm: diameter,
    mofType,
    series,
    pressureClass,
    angleDeg: angle,
    radiusMm: radiusL,
    twMm: tw,
    mofLengteLnomMm: jVal,
    weightKg: input.weightKg || 5.0,
    bdMm: input.bdMm || (diameter + tw * 2),
    vrijgaveStn1: true,
    vrijgaveStn2: true,
    stn1Targets,
    stn2Targets,
    speedsAndPitches: {
      windingSpeedRpm: Math.round(windingRpm * 10) / 10,
      speedPercentage,
      pitchMof1Mm: aa,
      pitchBochtMm: ab,
      pitchMof2Mm: ac,
      pitchNonWovenMm: ad,
      movingSpeedMof1MmSec: Math.round(bb * 10) / 10,
      movingSpeedBochtMmSec: Math.round(be * 10) / 10,
      movingSpeedMof2MmSec: Math.round(bc * 10) / 10,
      movingSpeedNonWovenMmSec: Math.round(bg * 10) / 10,
    },
    gangenCount: av,
    wikkeltijdMin: Math.max(1, az),
    fabricMeters: ay,
    updatedAt: new Date().toISOString(),
  };
};

export const generateWm18RapidCode = (item: Wm18CatalogItem): Wm18RapidModuleOutput => {
  const formatTarget = (t: Wm186DTarget) => `[[${t.x},${t.y},${t.z}],[0,0,0,0],${t.asconf},[0,9E9,9E9,9E9,9E9,9E9]];`;

  const desc = `${item.series} ${item.diameterMm}/${item.angleDeg}° ${item.mofType} ${item.pressureClass}`;

  const stn1RapidCode = `MODULE ProcesdataSTN1
! Targets Station 1 for ${desc}
VAR robtarget pSt1_Pos1:=${formatTarget(item.stn1Targets.pos1)}
VAR robtarget pSt1_Pos2:=${formatTarget(item.stn1Targets.pos2)}
VAR robtarget pSt1_Pos3:=${formatTarget(item.stn1Targets.pos3)}
VAR robtarget pSt1_Pos4:=${formatTarget(item.stn1Targets.pos4)}
VAR robtarget pSt1_Pos5:=${formatTarget(item.stn1Targets.pos5)}
VAR robtarget pSt1_ToPipe:=${formatTarget(item.stn1Targets.toPipe)}

! Rotation component targets
VAR num rSt1_Pos1_X:=${item.stn1Targets.pos1.rx};
VAR num rSt1_Pos1_Y:=${item.stn1Targets.pos1.ry};
VAR num rSt1_Pos1_Z:=${item.stn1Targets.pos1.rz};
VAR num rSt1_Pos2_X:=${item.stn1Targets.pos2.rx};
VAR num rSt1_Pos2_Y:=${item.stn1Targets.pos2.ry};
VAR num rSt1_Pos2_Z:=${item.stn1Targets.pos2.rz};
VAR num rSt1_Pos3_X:=${item.stn1Targets.pos3.rx};
VAR num rSt1_Pos3_Y:=${item.stn1Targets.pos3.ry};
VAR num rSt1_Pos3_Z:=${item.stn1Targets.pos3.rz};
VAR num rSt1_Pos4_X:=${item.stn1Targets.pos4.rx};
VAR num rSt1_Pos4_Y:=${item.stn1Targets.pos4.ry};
VAR num rSt1_Pos4_Z:=${item.stn1Targets.pos4.rz};

! Variables Station 1
VAR num St1_StartWindings:=0;
VAR num St1_EndWindings:=0;
VAR num St1_WindingCycles:=${item.gangenCount};
VAR num St1_MovingSpeed_M1:=${item.speedsAndPitches.movingSpeedMof1MmSec};
VAR num St1_MovingSpeed_B:=${item.speedsAndPitches.movingSpeedBochtMmSec};
VAR num St1_MovingSpeed_M2:=${item.speedsAndPitches.movingSpeedMof2MmSec};
VAR num St1_WindingSpeed:=${item.speedsAndPitches.windingSpeedRpm};
VAR string St1_ActualProduct:="${desc}";
VAR num St1_WeefselBenodigd:=${item.fabricMeters};
VAR num St1_Bd_Maat:=${item.bdMm};
ENDMODULE`;

  const stn2RapidCode = `MODULE ProcesdataSTN2
! Targets Station 2 for ${desc}
VAR robtarget pSt2_Pos1:=${formatTarget(item.stn2Targets.pos1)}
VAR robtarget pSt2_Pos2:=${formatTarget(item.stn2Targets.pos2)}
VAR robtarget pSt2_Pos3:=${formatTarget(item.stn2Targets.pos3)}
VAR robtarget pSt2_Pos4:=${formatTarget(item.stn2Targets.pos4)}
VAR robtarget pSt2_Pos5:=${formatTarget(item.stn2Targets.pos5)}
VAR robtarget pSt2_ToPipe:=${formatTarget(item.stn2Targets.toPipe)}

! Rotation component targets
VAR num rSt2_Pos1_X:=${item.stn2Targets.pos1.rx};
VAR num rSt2_Pos1_Y:=${item.stn2Targets.pos1.ry};
VAR num rSt2_Pos1_Z:=${item.stn2Targets.pos1.rz};

! Variables Station 2
VAR num St2_WindingCycles:=${item.gangenCount};
VAR num St2_MovingSpeed_M1:=${item.speedsAndPitches.movingSpeedMof1MmSec};
VAR num St2_MovingSpeed_B:=${item.speedsAndPitches.movingSpeedBochtMmSec};
VAR num St2_MovingSpeed_M2:=${item.speedsAndPitches.movingSpeedMof2MmSec};
VAR num St2_WindingSpeed:=${item.speedsAndPitches.windingSpeedRpm};
VAR string St2_ActualProduct:="${desc}";
VAR num St2_WeefselBenodigd:=${item.fabricMeters};
VAR num St2_Bd_Maat:=${item.bdMm};
ENDMODULE`;

  return {
    stn1RapidCode,
    stn2RapidCode,
    generatedAt: new Date().toISOString(),
    productDescription: desc,
  };
};
