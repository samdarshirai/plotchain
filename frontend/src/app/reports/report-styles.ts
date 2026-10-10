// Shared by both report screens (inline styles, same convention as team-plot-bookings).
export const REPORT_STYLES = `
  .report__filters { display: flex; flex-wrap: wrap; gap: 1rem; align-items: end; margin-bottom: 1rem; }
  .report__filters label { display: flex; flex-direction: column; gap: 0.25rem; }
  .report__scroll { overflow-x: auto; margin-bottom: 1.5rem; }
  .report__table { width: 100%; border-collapse: collapse; }
  .report__table th, .report__table td { padding: 0.5rem 0.75rem; text-align: left; white-space: nowrap; border-bottom: 1px solid var(--border-color, #e5e5e5); }
`;
