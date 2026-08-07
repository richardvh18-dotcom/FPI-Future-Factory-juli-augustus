export const normalizeQueueStationToken = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

export const resolvePreferredQueueDepartment = ({
  printer,
  availableDepartments,
}: {
  printer?: { department?: string; locationLabel?: string; name?: string } | null;
  availableDepartments?: Array<string | null | undefined>;
}): string => {
  const departments = (availableDepartments || [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (!departments.length) return '';

  const candidates = [
    String(printer?.department || '').trim(),
    String(printer?.locationLabel || '').trim(),
    String(printer?.name || '').trim(),
  ].filter(Boolean);

  if (!candidates.length) return '';

  const normalizedDepartments = departments.map((department) => ({
    original: department,
    normalized: normalizeQueueStationToken(department),
  }));

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeQueueStationToken(candidate);
    const directMatch = normalizedDepartments.find(
      (department) => department.normalized === normalizedCandidate
    );

    if (directMatch) {
      return directMatch.original;
    }

    const containsMatch = normalizedDepartments.find((department) => {
      return (
        department.normalized.includes(normalizedCandidate) ||
        normalizedCandidate.includes(department.normalized)
      );
    });

    if (containsMatch) {
      return containsMatch.original;
    }
  }

  return '';
};
