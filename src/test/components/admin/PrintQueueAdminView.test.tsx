import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect, vi } from 'vitest';
import PrintQueueAdminView from '../../../components/admin/PrintQueueAdminView';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

vi.mock('../../../contexts/NotificationContext', () => ({
  useNotifications: () => ({
    showError: vi.fn(),
    showConfirm: vi.fn().mockResolvedValue(true),
  }),
}));

vi.mock('../../../services/planningSecurityService', () => ({
  requeuePrintQueueJob: vi.fn(),
  deletePrintQueueJob: vi.fn(),
}));

describe('PrintQueueAdminView', () => {
  it('renders the management heading and empty state', () => {
    render(<PrintQueueAdminView />);

    expect(screen.getByText('printQueue.managementTitle')).toBeInTheDocument();
    expect(screen.getByText('printQueue.managementSubtitle')).toBeInTheDocument();
  });
});
