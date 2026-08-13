package com.plotchain.associate;

import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.springframework.stereotype.Service;

import java.util.UUID;

// role-capability unit 10 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
// "Digital ID card" row -- Associate sees "Own ID card only (photo, ID number, rank, QR)").
// Render-on-demand, not persisted: every call recomputes the response from the associate and
// rank_tier tables directly (the reconciliation table's own note: "No endpoint (spec always
// described this as render-on-demand, not persisted...)") -- there is no AssociateIdCard
// entity/table, and this method never writes one.
//
// photoUrl is always null today: no photo-upload/storage mechanism exists anywhere in this
// codebase (verified -- only AssociateKycDocument, which stores KYC review documents under a
// resubmission-resets-status-to-PENDING policy that would be wrong for a personal photo, and
// CompanyBranding's logo bytes, a company-wide asset, not a per-associate one), AND the spec's
// own "Own profile" row -- the one place that lists which fields an Associate can edit (name,
// contact, bank details, KYC docs, login/transaction password) -- never mentions a photo
// either. There is no described ingestion path for this field anywhere in the spec, so
// inventing upload infrastructure here would be scope invention beyond both this unit and the
// spec itself. A future unit -- most likely folded into unit 11/14's profile-edit work, the
// natural home for any associate-editable field -- should revisit this once the spec describes
// how a photo actually gets set.
@Service
public class AssociateIdCardService {

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;

    public AssociateIdCardService(AssociateRepository associateRepository, RankTierRepository rankTierRepository) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
    }

    // Self-scoped by construction: associateId always comes from the caller's own JWT (see
    // AssociateIdCardController), never from the request -- no caller can view another
    // associate's ID card through this method, same reasoning as
    // CompensationPlanService#getMyRankProgress.
    public AssociateIdCardResponse getMyIdCard(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));
        if (associate.getRankId() == null) {
            // In practice only reachable by an ADMIN token calling this associate-only route --
            // chk_associate_rank_required guarantees every ASSOCIATE-role row has a rank.
            throw new NoRankAssignedException(associateId);
        }
        RankTier rank = rankTierRepository.findById(associate.getRankId())
            .orElseThrow(() -> new IllegalStateException(
                "Associate's rank not found in rank table: " + associate.getRankId()));

        // The QR payload is the data a frontend would encode into a QR image client-side, not a
        // server-rendered image -- no QR-generation library exists in pom.xml, and the simpler,
        // no-new-dependency option is preferred absent a stated need for a server-rendered
        // image. Encodes the associate's own userId -- the same self-scoped identifier already
        // used for login and directory lookup -- rather than a verification URL, since no
        // public verification page/endpoint exists in this codebase to point at, and inventing
        // one would exceed this unit's scope.
        return new AssociateIdCardResponse(
            associate.getUserId(),
            associate.getName(),
            rank.getName(),
            null,
            associate.getUserId()
        );
    }
}
