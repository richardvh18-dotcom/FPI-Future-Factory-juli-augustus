import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PlanningSidebarOrderCard from '../../../components/digitalplanning/PlanningSidebarOrderCard';

describe('PlanningSidebarOrderCard', () => {
  it('renders the order summary and prediction label', () => {
    const order = {
      id: 'order-1',
      orderId: 'ORD-1001',
      itemCode: 'ABC-001',
      item: 'Product X',
      itemDescription: 'Fine product',
      extraCode: 'EMT',
      status: 'in_progress',
      project: 'Project A',
      priority: 'urgent',
      completedAt: null,
      createdAt: null,
      updatedAt: null,
      timestamps: {},
      delegatedTo: '',
    };

    render(
      <PlanningSidebarOrderCard
        order={order as any}
        onSelect={() => undefined}
        isSelected={false}
        isNew={false}
        isDelegated={false}
        isDelegatedStatus={false}
        isCancelled={false}
        isOnHold={false}
        effectiveStatus="In behandeling"
        plannedAmount={10}
        finishedAmount={4}
        cardTintClass="border-slate-50 bg-white"
        priorityBadge={{ label: 'Spoed', className: 'bg-orange-100 text-orange-700' }}
        orderTypeBadge={{ label: 'EMT', className: 'bg-sky-100 text-sky-700' }}
        predictionLabel="Op schema"
        predictionClass="text-amber-700"
        orderWithPrediction={{ ...order, predictedReadyDate: null, scheduleStatus: 'unknown', slipDays: 0 }}
        getOrderDisplayName={() => 'Product X'}
        formatDeliveryDate={() => '12-07-2026'}
        formatDateWithWeek={() => '12-07-2026'}
        t={(key: string, fallback?: string) => fallback || key}
      />
    );

    expect(screen.getByText('ORD-1001')).toBeInTheDocument();
    expect(screen.getByText('Product X')).toBeInTheDocument();
    expect(screen.getByText('Spoed')).toBeInTheDocument();
    expect(screen.getAllByText('EMT').length).toBeGreaterThan(0);
    expect(screen.getByText('Op schema')).toBeInTheDocument();
  });
});
