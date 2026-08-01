export type RobotProgramPreparation = {
  diameterMm: number | null;
  pressureClass: string;
  destinationFolder: string;
  status: 'prepared' | 'ready-for-gateway';
  notes?: string;
  category?: string;
  source?: string;
  generatedAt?: string;
  orderId?: string;
  lotNumber?: string;
  stationId?: string;
  robotPosition?: number | null;
};

export const buildRobotProgramPreparation = ({
  diameterMm,
  pressureClass,
  notes,
  category,
  source = 'wm18-excel',
  generatedAt = new Date().toISOString(),
}: {
  diameterMm?: string | number | null;
  pressureClass?: string | null;
  notes?: string;
  category?: string;
  source?: string;
  generatedAt?: string;
}): RobotProgramPreparation => {
  const normalizedDiameter = Number(diameterMm);
  const safeDiameter = Number.isFinite(normalizedDiameter) ? normalizedDiameter : null;
  const safePressureClass = String(pressureClass || '').trim() || 'PN16';

  return {
    diameterMm: safeDiameter,
    pressureClass: safePressureClass,
    destinationFolder: 'robot_programs/ftp_upload',
    status: 'ready-for-gateway',
    notes: notes?.trim() || 'Voorbereid voor later FTP/gateway-overdracht',
    category: category?.trim() || 'WM18',
    source,
    generatedAt,
  };
};

export const buildBh18RobotProgramPreparation = ({
  orderId,
  lotNumber,
  stationId,
  robotPosition,
  diameterMm,
  pressureClass,
  notes,
  category = 'BH18',
  source = 'production-start',
  generatedAt = new Date().toISOString(),
}: {
  orderId?: string | null;
  lotNumber?: string | null;
  stationId?: string | null;
  robotPosition?: number | string | null;
  diameterMm?: string | number | null;
  pressureClass?: string | null;
  notes?: string;
  category?: string;
  source?: string;
  generatedAt?: string;
}): RobotProgramPreparation => {
  const basePreparation = buildRobotProgramPreparation({
    diameterMm,
    pressureClass,
    notes,
    category,
    source,
    generatedAt,
  });

  const normalizedPosition = Number(robotPosition);

  return {
    ...basePreparation,
    orderId: String(orderId || '').trim() || undefined,
    lotNumber: String(lotNumber || '').trim() || undefined,
    stationId: String(stationId || '').trim() || undefined,
    robotPosition: Number.isFinite(normalizedPosition) ? normalizedPosition : null,
  };
};
