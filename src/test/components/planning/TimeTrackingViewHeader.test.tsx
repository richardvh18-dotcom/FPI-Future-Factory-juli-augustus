import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import TimeTrackingViewHeader from '../../../components/planning/TimeTrackingViewHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

describe('TimeTrackingViewHeader', () => {
  it('renders the title, subtitle and filter controls', () => {
    render(
      <TimeTrackingViewHeader
        t={(key: string, fallback?: string) => fallback || key}
        periodMode="week"
        setPeriodMode={() => undefined}
        dayInputValue="2026-07-26"
        weekInputValue="2026-W30"
        monthInputValue="2026-07"
        handleDayChange={() => undefined}
        handleMonthChange={() => undefined}
        handleWeekChange={() => undefined}
        navigatePrevious={() => undefined}
        navigateNext={() => undefined}
        jumpToToday={() => undefined}
        selectedDate={new Date('2026-07-26T00:00:00')}
        selectedDepartment="ALLES"
        setSelectedDepartment={() => undefined}
        departments={['ALLES', 'Fittings']}
        selectedMachine="ALLES"
        setSelectedMachine={() => undefined}
        machineOptions={['BH01', 'BH02']}
        filterStatus="all"
        setFilterStatus={() => undefined}
      />
    );

    expect(screen.getByText('Time Tracking')).toBeInTheDocument();
    expect(screen.getByText('Vergelijk daadwerkelijke vs geplande tijd per order')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Vandaag' })).toBeInTheDocument();
  });
});
