// Backend enums arrive shouty-uppercase and underscore-separated (PENDING, CARRIED_FORWARD,
// SPONSOR_MATCHING); every mockup screen that renders one shows it Title Case with spaces
// (Viraj_Acres_Settings.dc.html -- e.g. the ledger rows' `Direct Income`/`Matching Income`/
// `Sponsor Bonus` and the status columns' `Pending`/`Carried Forward`).
//
// Screens that feed these values into the shared editable-table's badge cell must title-case the
// value BEFORE it reaches the table (the badge cell renders the row's value verbatim), which is
// why the badgeTone callbacks on those screens match on the title-cased string rather than the
// wire enum.
//
// Deliberately uppercases the first character rather than assuming the input already is: the
// helper must be correct for any input casing, not only SCREAMING_SNAKE_CASE.
export function titleCase(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return value
    .split('_')
    .map(word => (word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
}
