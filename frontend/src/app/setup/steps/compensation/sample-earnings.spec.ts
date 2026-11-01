import { computeSampleEarnings, SampleEarningsPlan, SampleEarningsResult } from './sample-earnings';

// Hand-verified baseline scenario (₹10L on each leg, matching the spec's own example):
//   scenarioVolume = 1,000,000
//   directIncome   = 2 * 1,000,000 * 5/100 = 100,000  (each leg's sponsee sale pays the sponsor)
//   matchingIncome = 1,000,000 * 10/100 = 100,000
//   sponsorBonus   = 20/100 * 100,000   = 20,000
//   royaltyBonus   = 1,000,000 * 2/100  = 20,000
//   grossIncome    = 100,000 + 100,000 + 20,000 + 20,000 = 240,000
//   adminCharge(PAN)    = 240,000 * 3/100 = 7,200
//   adminCharge(no PAN) = 240,000 * 8/100 = 19,200
//   tds                 = 240,000 * 5/100 = 12,000
//   finalEarnings(PAN)    = 240,000 - 7,200  - 12,000 = 220,800
//   finalEarnings(no PAN) = 240,000 - 19,200 - 12,000 = 208,800
const basePlan: SampleEarningsPlan = {
  directIncomePct: 5,
  matchingIncomePct: 10,
  sponsorMatchingPct: 20,
  tdsPct: 5,
  adminChargeWithPanPct: 3,
  royaltyPct: 2
};

describe('computeSampleEarnings', () => {
  it('direct income counts both legs\' sponsee sales (paid to their sponsor)', () => {
    const result = computeSampleEarnings({ scenarioVolume: 1_000_000 }, { ...basePlan, directIncomePct: 6 });

    expect(result.directIncome).toBe(120_000); // compensation-plan-reference.md Round 1
  });

  it('computes matchingIncome as scenarioVolume * matchingIncomePct / 100', () => {
    const scenarioVolume = 1_000_000;
    const result = computeSampleEarnings({ scenarioVolume }, basePlan);

    expect(result.matchingIncome).toBe((scenarioVolume * basePlan.matchingIncomePct) / 100);
    expect(result.matchingIncome).toBe(100_000);
  });

  it('computes sponsorBonus as sponsorMatchingPct / 100 * matchingIncome', () => {
    const scenarioVolume = 1_000_000;
    const result = computeSampleEarnings({ scenarioVolume }, basePlan);

    expect(result.sponsorBonus).toBe((basePlan.sponsorMatchingPct / 100) * result.matchingIncome);
    expect(result.sponsorBonus).toBe(20_000);
  });

  it('applies the processing fee (adminChargeWithPanPct) to grossIncome', () => {
    const result = computeSampleEarnings({ scenarioVolume: 1_000_000 }, basePlan);

    expect(result.grossIncome).toBe(240_000);
    expect(result.adminCharge).toBe(7_200);
  });

  it('computes finalEarnings as grossIncome - adminCharge - tds', () => {
    const result = computeSampleEarnings({ scenarioVolume: 1_000_000 }, basePlan);

    expect(result.finalEarnings).toBeCloseTo(result.grossIncome - result.adminCharge - result.tds, 6);
    expect(result.finalEarnings).toBeCloseTo(220_800, 6);
  });

  it('returns an all-zero result for scenarioVolume: 0 without throwing', () => {
    let result: SampleEarningsResult | undefined;
    expect(() => {
      result = computeSampleEarnings({ scenarioVolume: 0 }, basePlan);
    }).not.toThrow();

    expect(result).toEqual({
      directIncome: 0,
      matchingIncome: 0,
      sponsorBonus: 0,
      royaltyBonus: 0,
      grossIncome: 0,
      adminCharge: 0,
      tds: 0,
      finalEarnings: 0
    });
  });

  it('yields royaltyBonus === 0 for royaltyPct: 0 (empty royalty table) without affecting the other computed lines', () => {
    const scenarioVolume = 1_000_000;
    const noRoyaltyPlan: SampleEarningsPlan = { ...basePlan, royaltyPct: 0 };

    const withRoyalty = computeSampleEarnings({ scenarioVolume }, basePlan);
    const noRoyalty = computeSampleEarnings({ scenarioVolume }, noRoyaltyPlan);

    expect(noRoyalty.royaltyBonus).toBe(0);
    expect(noRoyalty.directIncome).toBe(withRoyalty.directIncome);
    expect(noRoyalty.matchingIncome).toBe(withRoyalty.matchingIncome);
    expect(noRoyalty.sponsorBonus).toBe(withRoyalty.sponsorBonus);
  });
});
