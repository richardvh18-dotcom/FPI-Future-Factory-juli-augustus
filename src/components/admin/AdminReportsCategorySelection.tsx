import React from 'react';
import type { ReactNode } from 'react';

type ReportCategory = {
  id: string;
  title: string;
  description: string;
  color: string;
  reports: Array<{ id: string; [key: string]: unknown }>;
  icon: ReactNode;
};

type AdminReportsCategorySelectionProps = {
  t: (key: string, fallback?: string) => string;
  sourceBadge: ReactNode;
  reportCategories: ReportCategory[];
  onSelectCategory: (category: ReportCategory) => void;
};

const AdminReportsCategorySelection = ({
  t,
  sourceBadge,
  reportCategories,
  onSelectCategory,
}: AdminReportsCategorySelectionProps) => {
  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-8">
      <div className="max-w-7xl mx-auto">
        {sourceBadge}
        <div className="mb-8">
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tight mb-2">
            {t('reports.title', 'Rapportage Centre')}
          </h2>
          <p className="text-slate-500 text-sm">
            {t('reports.subtitle', 'Selecteer een rapportage categorie om te beginnen')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reportCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => onSelectCategory(category)}
              className={`group p-8 rounded-3xl border-2 ${category.color} hover:shadow-xl transition-all duration-300 text-left active:scale-95`}
            >
              <div className="p-4 bg-white rounded-2xl shadow-md w-fit mb-6 group-hover:scale-110 transition-transform">
                {category.icon}
              </div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-3">
                {category.title}
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed mb-4">
                {category.description}
              </p>
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                {category.reports.length} rapporten beschikbaar
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AdminReportsCategorySelection;
