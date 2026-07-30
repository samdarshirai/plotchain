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
  hasPan: boolean;
}

export interface SampleEarningsPlan {
  directIncomePct: number;
  matchingIncomePct: number;
  sponsorMatchingPct: number;
  tdsPct: number;
  adminChargeWithPanPct: number;
  adminChargeWithoutPanPct: number;
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
  const { scenarioVolume, hasPan } = input;
  const {
    directIncomePct,
    matchingIncomePct,
    sponsorMatchingPct,
    tdsPct,
    adminChargeWithPanPct,
    adminChargeWithoutPanPct,
    royaltyPct
  } = plan;

  // Spec-verbatim (setup-onboarding-spec.md:56): "applied to a solo sale".
  const directIncome = (scenarioVolume * directIncomePct) / 100;

  // Spec-verbatim (setup-onboarding-spec.md:57): "applied to matched-pair volume".
  // Both legs are set equal to scenarioVolume in this single-input preview, so
  // min(left, right) = scenarioVolume.
  const matchingIncome = (scenarioVolume * matchingIncomePct) / 100;

  // DERIVED (spec is silent on the exact base for this line — spec text says
  // "applied to a direct sponsee's matching income", setup-onboarding-spec.md:58).
  // This single-scenario preview has no separate sponsee input, so it reuses the
  // same computed `matchingIncome` above as a stand-in for "a sponsee's matching
  // income". This is a genuine spec gap, not an obvious inference.
  const sponsorBonus = (sponsorMatchingPct / 100) * matchingIncome;

  // DERIVED: royalty bonus applied to the scenario volume at the resolved rank rate.
  const royaltyBonus = (scenarioVolume * royaltyPct) / 100;

  const grossIncome = directIncome + matchingIncome + sponsorBonus + royaltyBonus;

  const adminChargePct = hasPan ? adminChargeWithPanPct : adminChargeWithoutPanPct;
  const adminCharge = (grossIncome * adminChargePct) / 100;

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
