import React from 'react';
export type AnyRecord = Record<string, unknown>;

export type ReportItem = AnyRecord & {
  id?: string;
};

export type ReportCategory = {
  id: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  color?: string;
  reports: ReportDefinition[];
};

export type ReportDefinition = {
  id: string;
  title: string;
  description: string;
  icon?: React.ReactNode;
  metrics: string[];
};

export type KpiPopupState = {
  open: boolean;
  type: string | null;
};
