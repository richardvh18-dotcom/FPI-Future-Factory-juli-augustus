const normalizePrintQueueStatus = (value) => String(value || '').trim().toLowerCase();

const isPendingLikePrintQueueStatus = (value) => {
  const normalized = normalizePrintQueueStatus(value);
  return normalized === 'pending' || normalized === 'queued' || normalized === 'processing';
};

const isValidPrintQueueTransition = ({ currentStatus, nextStatus }) => {
  const current = normalizePrintQueueStatus(currentStatus);
  const next = normalizePrintQueueStatus(nextStatus);

  if (!current || !next) return false;
  if (current === next) return true;

  if (current === 'pending' && ['cancelled', 'error'].includes(next)) return true;
  if (isPendingLikePrintQueueStatus(current) && ['printing', 'completed', 'cancelled', 'error'].includes(next)) return true;
  if (current === 'printing' && ['completed', 'error'].includes(next)) return true;
  if (current === 'error' && ['pending', 'cancelled'].includes(next)) return true;

  return false;
};

module.exports = {
  isValidPrintQueueTransition,
  isPendingLikePrintQueueStatus,
  normalizePrintQueueStatus,
};
