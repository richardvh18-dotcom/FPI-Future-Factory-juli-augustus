import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import AdminReportsCategorySelection from '../../../components/admin/AdminReportsCategorySelection';

describe('AdminReportsCategorySelection', () => {
  it('renders categories and selects one', () => {
    const onSelectCategory = vi.fn();

    render(
      <AdminReportsCategorySelection
        t={(key: string, fallback?: string) => fallback || key}
        sourceBadge={<div>Source badge</div>}
        reportCategories={[
          {
            id: 'production',
            title: 'Productie Rapporten',
            description: 'Rapportage voor productie',
            color: 'border-blue-300',
            reports: [{ id: 'overview' }],
            icon: <span>📈</span>,
          },
        ]}
        onSelectCategory={onSelectCategory}
      />
    );

    expect(screen.getByText('Rapportage Centre')).toBeInTheDocument();
    expect(screen.getByText('Productie Rapporten')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Productie Rapporten/i }));

    expect(onSelectCategory).toHaveBeenCalledWith(expect.objectContaining({ id: 'production' }));
  });
});
