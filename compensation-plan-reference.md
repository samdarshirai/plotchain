# Compensation Plan — Ground-Truth Calculation Reference

## Purpose

Ground-truth Direct/Matching/Sponsor's Matching/Royalty/Self-Performance/Reward math, transcribed directly from Samvardhani Infra's official income-plan PDFs — not from `mlm-land-platform-spec.md`'s independently-authored §3 sketch, and not from whatever the already-implemented Cycle Management batch currently does. Use this doc to:

- Write/verify backend unit tests (`SettlementServiceTest` and friends) against real numbers, not invented ones.
- Cross-check `compensation-calculator.xlsx` (same directory) — a spreadsheet with live formulas for manually verifying the app's calculated payouts.
- Resolve the discrepancy flagged below before trusting either source for Royalty Bonus.

**Source documents**: `Samvardhani Income plan.pdf` (17 pages), `Samvardhani Income Process..pdf` (14 pages) — the complete source for this doc.

---

## 1. Flat-rate income types

| Income type | Rate | Base | Reach up the tree |
|---|---|---|---|
| **Direct Income** | 6% | The plot sale value | One hop — only the direct sponsor of the seller |
| **Matching Income** | 7% | `min(left leg volume, right leg volume)` — this cycle's new volume plus anything carried forward | Every ancestor, no depth limit — each recalculates off their own two legs |
| **Sponsor's Matching Bonus** | 11% | The Matching Income each of your *direct* sponsees earns | One hop only — does not chain to your sponsor's sponsor |
| **Self-Performance Bonus** | 1% (≥2,000 sqft) / 2% (≥3,000 sqft) | Own single-closing sale | Self only, not team-based |

## 2. Deductions (apply to every payout's gross amount)

| Deduction | Rate |
|---|---|
| TDS | 2% |
| Admin charge — PAN on file | 5% |
| Admin charge — no PAN on file | 15% |
| ID activation fee (one-time) | ₹1,100 |

`net = gross − (gross × TDS%) − (gross × admin%)`

## 3. Royalty Bonus — volume-slab, keyed to *this closing's* matched business

> "Royalty Bonus will Calculate on the Bonus of New Matching Business in a Single Closing" — source, verbatim note on the Royalty Bonus slide.

| New matched business (this closing) | Royalty Bonus rate |
|---|---|
| ₹20,00,000 | 1% |
| ₹40,00,000 | 1.5% |
| ₹80,00,000 | 2% |
| ₹1,50,00,000 | 2.5% |
| ₹3,00,00,000 | 3% |

Lookup is "highest threshold not exceeded" against the associate's own `min(left, right)` for *this cycle* — the same base amount as that cycle's Matching Income, at a different (rising) rate. **Not rank-based.**

## 4. Reward Income ladder — cumulative matched business, one-time per tier

| Cumulative matched business | Designation | Cash reward | Perk |
|---|---|---|---|
| ₹5,00,000 | Sales Associate | ₹15,000 | Smart Watch |
| ₹10,00,000 | Sales Executive | ₹20,000 | Manali, 2N/3D |
| ₹20,00,000 | Senior Sales Executive | ₹45,000 | Goa, 3N/4D |
| ₹40,00,000 | Sales Manager | ₹90,000 | Thailand, 4N/5D |
| ₹80,00,000 | Senior Sales Manager | ₹1,80,000 | Dubai, 5N/6D |
| ₹1,50,00,000 | Territory Manager | ₹4,00,000 | or a mini car |
| ₹3,00,00,000 | Chief Manager | ₹8,00,000 | or a big car |
| ₹6,00,00,000 | Assistant General Manager | ₹16,00,000 | or a premium car |
| ₹12,00,00,000 | General Manager | ₹32,00,000 | or a luxury car |
| ₹25,00,00,000 | Vice President | ₹64,00,000 | or a 2BHK flat |
| ₹50,00,00,000 | President | ₹1,50,00,000 | or a bungalow |
| ₹100,00,00,000 | Sales Director | ₹3,00,00,000 | + 5% profit share |

A tier is awarded once, ever, the first cycle it's crossed — matches the already-implemented behavior (`RewardTier`, checked via `existsByAssociateIdAndIncomeTypeAndSourceRef`, no `cycleId` in the check — see `2026-08-03-cycle-management-domain-design.md` Decision #8).

---

## 5. ⚠️ Known discrepancy vs. the already-implemented Cycle Management batch

`docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md` is marked **done** (11/11 units merged). Its Royalty Bonus (Decision #7, #37 in that doc; `CycleService.creditRoyalty()`) is **rank-keyed**:

```java
Optional<RoyaltyBonusRate> rate = royaltyBonusRateRepository
    .findByPlanVersionIdAndRankId(planVersion.getId(), associate.getRankId());
```

i.e. the royalty % is looked up from the associate's *current rank/designation*, not from this cycle's matched-business volume.

**The source PDFs describe something different**: Royalty Bonus keyed to a volume slab on *this closing's* new matched business (§3 above) — a cycle-local number, unrelated to rank.

These two formulas will diverge for real associates — e.g. someone who ranked up early but has a small-volume cycle gets a high royalty % under the implemented rank-based logic, but a low one under the PDF's volume-based logic (and vice versa for someone with a huge cycle who hasn't ranked up yet). **This needs a decision from whoever owns the compensation plan** before either this doc's Royalty numbers or the implemented code's Royalty numbers can be trusted as "the" ground truth for testing that code path. Not resolved here — flagged for follow-up, and reflected as two separate, separately-labeled formulas in `compensation-calculator.xlsx`.

Matching Income, Sponsor's Matching Bonus, and Reward Income were spot-checked against the same domain-design doc and match this doc's formulas (see `CycleService.creditMatchingIncome()`, `creditSponsorMatching()`, `creditRewards()`).

---

## 6. Worked examples (test fixtures)

### Round 1 — two direct sponsees each close a sale

Inputs: sponsee A closes ₹10,00,000; sponsee B closes ₹10,00,000 (your left/right leg respectively).

| Line | Formula | Amount |
|---|---|---|
| Direct Income | 6% × ₹10,00,000 (A) + 6% × ₹10,00,000 (B) | ₹1,20,000 |
| Matching Income | 7% × min(₹10,00,000, ₹10,00,000) | ₹70,000 |
| Reward Income | First milestone reward (source's own figure — see Known Gaps #2) | ₹15,000 |
| **Total** | | **₹2,05,000 + Smart Watch** |

### Round 2 — A and B's own teams start selling

Inputs: A sponsors C (₹30,00,000) and D (₹20,00,000). B sponsors E (₹23,00,000) and F (₹17,00,000). Your left leg = C+D = ₹50,00,000; your right leg = E+F = ₹40,00,000.

| Line | Formula | Amount |
|---|---|---|
| Your Matching Income | 7% × min(₹50,00,000, ₹40,00,000) | ₹2,80,000 |
| A's Matching Income (intermediate) | 7% × min(₹30,00,000, ₹20,00,000) | ₹1,40,000 |
| B's Matching Income (intermediate) | 7% × min(₹23,00,000, ₹17,00,000) | ₹1,19,000 |
| Sponsor's Matching Bonus — from A | 11% × ₹1,40,000 | ₹15,400 |
| Sponsor's Matching Bonus — from B | 11% × ₹1,19,000 | ₹13,090 |
| **Sponsor's Matching Bonus — total** | | **₹28,490** |
| Royalty Bonus (volume-slab method, §3) | ₹40,00,000 falls in the ₹40L slab → 1.5% × ₹40,00,000 | ₹60,000 |
| Royalty Bonus (rank-keyed method, as implemented) | Depends on your `rankId` at time of this cycle — cannot be computed from volume alone; see §5 | *not derivable from these inputs* |
| Reward Income (cumulative, 3 tiers crossed) | ₹15,000 + ₹20,000 + ₹45,000 (₹5L/₹10L/₹20L tiers) | ₹80,000 |
| **Total** (using volume-slab Royalty) | | **₹4,48,490 + Smart Watch + Manali + Goa** |

---

## 7. Depth behavior

- **Matching Income and Royalty Bonus**: apply to every ancestor regardless of tree depth — each recalculates independently off their own subtree totals. No explicit source statement, but consistent with the "min(left, right)" formula applying per-node and with the implemented batch's leaf-to-root rollup (`CycleService`, Decision #4 in the domain-design doc).
- **Sponsor's Matching Bonus**: explicitly one generation only, confirmed by both the source ("11% × matching income of *each* direct sponsee") and the implementation (`creditSponsorMatching()` iterates `findBySponsorId`, direct sponsees only, no recursion).
- No per-generation override schedule (e.g. Level 1 = 11%, Level 2 = 5%, ...) exists in either source PDF or the implementation.

---

## 8. Known gaps — flag before treating any number here as final

1. **No documented base commission for a personal sale below the Self-Performance Bonus threshold** (i.e., a closing under 2,000 sqft). Neither PDF states a rate for this case.
2. **Round 1's Reward Income (₹15,000) doesn't cleanly reconcile against the Reward Ladder's own thresholds** — the source pays the ₹5L-tier reward on what is actually a ₹10,00,000 matched pair, without explaining the ₹5L vs ₹10L gap. Reproduced faithfully from the source's own worked example, not resolved or corrected here.
3. See §5 for the Royalty Bonus rank-vs-volume discrepancy — the most consequential open gap for testing purposes.

## 9. Files

- This doc — ground truth + worked-example test fixtures.
- `compensation-calculator.xlsx` — same numbers as live spreadsheet formulas: an editable Rates & Slabs sheet, the two worked examples above reproduced with formulas (not hardcoded), and a blank Calculator sheet for plugging in real numbers pulled from the app to manually cross-check its output.
