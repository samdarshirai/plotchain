package com.plotchain.associate;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "associate")
public class Associate {
    @Id
    private UUID id;
    @Column(name = "sponsor_id")
    private UUID sponsorId;
    @Column(name = "parent_id")
    private UUID parentId;
    private String position;
    private String name;
    private String phone;
    @Column(name = "rank_id")
    private UUID rankId;
    @Enumerated(EnumType.STRING)
    @Column(name = "kyc_status", nullable = false)
    private KycStatus kycStatus;
    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;
    @Column(name = "cumulative_matched_volume", nullable = false)
    private BigDecimal cumulativeMatchedVolume = BigDecimal.ZERO;
    @Column(name = "last_active_at")
    private Instant lastActiveAt;
    @Column(name = "user_id", nullable = false)
    private String userId;
    private String email;
    @Column(name = "password_hash", nullable = false)
    private String passwordHash;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AssociateRole role;
    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getSponsorId() { return sponsorId; }
    public void setSponsorId(UUID sponsorId) { this.sponsorId = sponsorId; }
    public UUID getParentId() { return parentId; }
    public void setParentId(UUID parentId) { this.parentId = parentId; }
    public String getPosition() { return position; }
    public void setPosition(String position) { this.position = position; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public UUID getRankId() { return rankId; }
    public void setRankId(UUID rankId) { this.rankId = rankId; }
    public KycStatus getKycStatus() { return kycStatus; }
    public void setKycStatus(KycStatus kycStatus) { this.kycStatus = kycStatus; }
    public Instant getJoinedAt() { return joinedAt; }
    public void setJoinedAt(Instant joinedAt) { this.joinedAt = joinedAt; }
    public BigDecimal getCumulativeMatchedVolume() { return cumulativeMatchedVolume; }
    public void setCumulativeMatchedVolume(BigDecimal v) { this.cumulativeMatchedVolume = v; }
    public Instant getLastActiveAt() { return lastActiveAt; }
    public void setLastActiveAt(Instant lastActiveAt) { this.lastActiveAt = lastActiveAt; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public AssociateRole getRole() { return role; }
    public void setRole(AssociateRole role) { this.role = role; }
    public boolean isMustChangePassword() { return mustChangePassword; }
    public void setMustChangePassword(boolean mustChangePassword) { this.mustChangePassword = mustChangePassword; }
}
