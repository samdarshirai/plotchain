package com.plotchain.epin;

// epin-domain unit 2 (docs/superpowers/specs/role-capability/2026-08-03-epin-domain-design.md,
// Decision 6): closed enum, not free text -- the PRD names exactly these two redemption
// occasions ("used at associate activation or plot top-up time"). Matches the
// chk_epin_redemption_type CHECK constraint (migration V33).
public enum RedemptionType {
    ACTIVATION,
    TOPUP
}
