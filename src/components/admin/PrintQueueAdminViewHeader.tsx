import React from 'react';
import { useTranslation } from 'react-i18next';

type PrintQueueAdminViewHeaderProps = {
  title: string;
  subtitle: string;
};

const PrintQueueAdminViewHeader = ({ title, subtitle }: PrintQueueAdminViewHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className="mb-6">
      <h1 className="text-3xl font-bold mb-2">{t(title, title)}</h1>
      <p className="text-slate-600">{t(subtitle, subtitle)}</p>
    </div>
  );
};

export default PrintQueueAdminViewHeader;
