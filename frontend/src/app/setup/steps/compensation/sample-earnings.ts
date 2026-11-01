/**
 * Pure, Angular-free calculation for the "Sample Earnings Preview" panel on the
 * Compensation Plan setup step (setup-onboarding-spec.md Step 3, "Live calculation
 * preview": "if an associate sells ₹10L on each leg, they'd earn ₹X").
 *
 * The spec's own example is single-input, so the preview takes one `scenarioVolume`
 * applied symmetrically to both legs (rather than separate left/right/solo inputs).
 */

export interface SampleEarningsInput {
  scenarioVolume: number;
}

export interface SampleEarningsPlan {
  directIncomePct: number;
  matchingIncomePct: number;
  sponsorMatchingPct: number;
  tdsPct: number;
  /** Processing fee %. */
  adminChargeWithPanPct: number;
  /** From the first configured royalty-table row; 0 if the table is empty. Row
   * selection is the caller's responsibility — this function only consumes the
   * already-resolved flat percentage. */
  royaltyPct: number;
}

export interface SampleEarningsResult {
  directIncome: number;
  matchingIncome: number;
  sponsorBonus: number;
  royaltyBonus: number;
  grossIncome: number;
  adminCharge: number;
  tds: number;
  finalEarnings: number;
}

export function computeSampleEarnings(
  input: SampleEarningsInput,
  plan: SampleEarningsPlan
): SampleEarningsResult {
  const { scenarioVolume } = input;
  const {
    directIncomePct,
    matchingIncomePct,
    sponsorMatchingPct,
    tdsPct,
    adminChargeWithPanPct,
    royaltyPct
  } = plan;

  // Direct Income is the sponsor's cut of each direct sponsee's sale (compensation-plan-reference.md
  // section 1). The preview associate has one sponsee per leg, each selling scenarioVolume, so the
  // associate earns on both: Round 1's 6% x 10L + 6% x 10L = 1,20,000.
  const directIncome = (2 * scenarioVolume * directIncomePct) / 100;

  // Spec-verbatim (setup-onboarding-spec.md:57): "applied to matched-pair volume".
  // Both legs are set equal to scenarioVolume in this single-input preview, so
  // min(left, right) = scenarioVolume.
  const matchingIncome = (scenarioVolume * matchingIncomePct) / 100;

  // DERIVED (spec is silent on the exact base for this line — spec text says
  // "applied to the matching income of each associate you sponsored, wherever they are placed", setup-onboarding-spec.md:58).
  // This single-scenario preview has no separate sponsee input, so it reuses the
  // same computed `matchingIncome` above as a stand-in for "a sponsee's matching
  // income". This is a genuine spec gap, not an obvious inference.
  const sponsorBonus = (sponsorMatchingPct / 100) * matchingIncome;

  // DERIVED: royalty bonus applied to the scenario volume at the resolved rank rate.
  const royaltyBonus = (scenarioVolume * royaltyPct) / 100;

  const grossIncome = directIncome + matchingIncome + sponsorBonus + royaltyBonus;

  const adminCharge = (grossIncome * adminChargeWithPanPct) / 100;

  const tds = (grossIncome * tdsPct) / 100;

  const finalEarnings = grossIncome - adminCharge - tds;

  return {
    directIncome,
    matchingIncome,
    sponsorBonus,
    royaltyBonus,
    grossIncome,
    adminCharge,
    tds,
    finalEarnings
  };
}
