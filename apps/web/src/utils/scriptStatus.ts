/**
 * Normalize script status for display (e.g. Badge labels).
 * API may return lowercase/snake (approved, in_review) or display form (Approved, In Review).
 */
export function normalizeScriptStatusForDisplay(status: string | undefined): string {
  if (!status || !status.trim()) return '—';
  const s = status.trim().toLowerCase().replace(/\s+/g, '_');
  const map: Record<string, string> = {
    approved: 'Approved',
    rejected: 'Rejected',
    draft: 'Draft',
    pending: 'Pending',
    in_review: 'In Review',
    review_required: 'Review Required',
    analysis_running: 'Analysis Running',
    assigned: 'Assigned',
    completed: 'Completed',
  };
  return map[s] ?? status;
}

/**
 * Canonical form for filtering (lowercase, spaces to underscore).
 */
export function normalizeScriptStatusForFilter(status: string | undefined): string {
  if (!status || !status.trim()) return '';
  return status.trim().toLowerCase().replace(/\s+/g, '_');
}
