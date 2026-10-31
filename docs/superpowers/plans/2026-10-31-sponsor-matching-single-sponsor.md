# Sponsor Matching — Single Sponsor, Any Placement Depth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock in the confirmed rule — an associate's Sponsor Matching (11% of their Matching gross) goes to their one sponsor (`sponsor_id`) only, regardless of how deep they are placed in the binary tree (`parent_id`) — with tests, and make the docs say so.

**Architecture:** No production code change. `CycleService.creditSponsorMatching` (`backend/src/main/java/com/plotchain/cycle/CycleService.java:580`) already pays exactly the `sponsor_id` sponsor via `findBySponsorId`, independent of `parent_id`. Existing tests never separate sponsor from placement parent, so a regression that switched to `parent_id` or started chaining would go unnoticed. This plan adds those tests (characterization tests — they pass on first run; that is expected) and fixes doc wording.

**Tech Stack:** Java 21, Spring Boot, JUnit 5, H2 integration tests (`@ActiveProfiles("test")`).

**Spec:** User decision 2026-10-31: "There should only be one sponsor per associate, so only one associate should get it." Source PDFs: `Samvardhani Income plan.pdf` p.7, `Samvardhani Income Process..pdf` p.9.

## Global Constraints

- Rate: `planVersion.getSponsorMatchingPct()` (11% in the seeded plan). Base: sponsee's MATCHING `grossAmount`.
- Paid to: the sponsee's `sponsor_id` associate only. Never `parent_id`, never the sponsor's sponsor.

## Review Focus

1. Cross-leg sponsorship — 5 sits in 2's subtree but 3 sponsors 5: 3 paid, 2 (placement parent) not paid. Task 1.
2. No chaining — 1 (3's sponsor, also root) gets nothing from 5's Matching. Task 1.
3. Live income (`refreshLiveIncome`) shares `computeIncome` with `close()`; one close-based test covers both.

---

### Task 1: Spillover + no-chaining integration test

**Files:**
- Test: `backend/src/test/java/com/plotchain/cycle/CycleCloseSponsorMatchingIntegrationTest.java` (add one test; reuse the class's `associate(...)` builder, `seedSale`, `SILVER_RANK_ID`, cleanup)

**Interfaces:**
- Consumes: `cycleService.close(UUID)`, `ledgerEntryRepository.findByAssociateIdAndCycleIdAndIncomeType(UUID, UUID, IncomeType)`, `ledgerEntryRepository.findAll()`.

- [ ] **Step 1: Write test `closePaysOnlyTheSponsorEvenWhenSponseeIsPlacedInAnotherLeg`**

User's own example (2026-10-31). Placement (`parent_id`) and sponsorship (`sponsor_id`):

```
            1                    (root)
          /   \
         2     3                 2: parent=1 L, sponsor=1     3: parent=1 R, sponsor=1
        / \
       4   5                     4: parent=2 L, sponsor=2     5: parent=2 R, sponsor=3   <-- sponsor is in the OTHER leg
          / \
         6   7                   6: parent=5 L, sponsor=5     7: parent=5 R, sponsor=5
                                 sales: 6 = 100, 7 = 100
```

Assertions after `cycleService.close(cycleId)`:
- 5's MATCHING gross = `7.00` (7% × min(100,100)).
- SPONSOR_MATCHING rows whose `sourceRef` = 5's MATCHING id: exactly 1, `associateId` = 3, gross = `0.77` (11% × 7.00).
- None of those rows belong to 2 (placement parent), 1 (3's sponsor / root), or 4.
- Filter by `sourceRef`, not by associate: 1 and 2 also earn their own MATCHING off 6/7's volume, and those produce their own, unrelated SPONSOR_MATCHING rows.

Add every new associate id to `@AfterEach` cleanup (children before parents — FKs).

- [ ] **Step 2: Run it**

Run: `cd backend && mvn test -Dtest=CycleCloseSponsorMatchingIntegrationTest`
Expected: PASS (characterization). Sanity-check it can fail: temporarily change `findBySponsorId` to `findByParentId` in `creditSponsorMatching`, rerun → FAIL, revert. Ignore known JDK/Mockito env noise in other classes.

- [ ] **Step 3: Commit**

```bash
git add backend/src/test/java/com/plotchain/cycle/CycleCloseSponsorMatchingIntegrationTest.java
git commit -m "test(income): pin sponsor matching to sponsor_id, not placement or grand-sponsor"
```

### Task 2: Docs wording

**Files:**
- Modify: `compensation-plan-reference.md` §1 row + §7 bullet (already edited, uncommitted — just review and include)
- Modify: `setup-onboarding-spec.md:58` — "applied to a direct sponsee's matching income" → "applied to the matching income of each associate you sponsored, wherever they are placed"
- Modify: `frontend/src/app/setup/steps/compensation/sample-earnings.ts:61` — keep the quote in sync with the spec line above

- [ ] **Step 1: Edit the two remaining files.**
- [ ] **Step 2: Commit**

```bash
git add compensation-plan-reference.md setup-onboarding-spec.md frontend/src/app/setup/steps/compensation/sample-earnings.ts
git commit -m "docs(income): sponsor matching goes to the single sponsor, any placement depth"
```
