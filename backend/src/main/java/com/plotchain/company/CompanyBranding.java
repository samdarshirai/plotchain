package com.plotchain.company;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "company_branding")
public class CompanyBranding {

    @Id
    private UUID id;

    @Column(name = "singleton_guard", nullable = false)
    private boolean singletonGuard = true;

    // Plain byte[] with no @Lob: Hibernate 6 maps an unannotated byte[] to VARBINARY, which
    // PostgreSQLDialect renders as bytea, matching the V7 column. @Lob on a byte[] maps to
    // BLOB instead, which Postgres can back with oid large-object semantics -- a mismatch
    // that would fail ddl-auto: validate against a plain BYTEA column.
    @Column(name = "logo_square")
    private byte[] logoSquare;

    @Column(name = "logo_square_content_type")
    private String logoSquareContentType;

    @Column(name = "logo_wide")
    private byte[] logoWide;

    @Column(name = "logo_wide_content_type")
    private String logoWideContentType;

    @Column(name = "primary_color", nullable = false)
    private String primaryColor;

    @Column(name = "secondary_color", nullable = false)
    private String secondaryColor;

    @Column(name = "tagline")
    private String tagline;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public UUID getId() { return id; }

    public byte[] getLogoSquare() { return logoSquare; }
    public void setLogoSquare(byte[] logoSquare) { this.logoSquare = logoSquare; }

    public String getLogoSquareContentType() { return logoSquareContentType; }
    public void setLogoSquareContentType(String logoSquareContentType) { this.logoSquareContentType = logoSquareContentType; }

    public byte[] getLogoWide() { return logoWide; }
    public void setLogoWide(byte[] logoWide) { this.logoWide = logoWide; }

    public String getLogoWideContentType() { return logoWideContentType; }
    public void setLogoWideContentType(String logoWideContentType) { this.logoWideContentType = logoWideContentType; }

    public String getPrimaryColor() { return primaryColor; }
    public void setPrimaryColor(String primaryColor) { this.primaryColor = primaryColor; }

    public String getSecondaryColor() { return secondaryColor; }
    public void setSecondaryColor(String secondaryColor) { this.secondaryColor = secondaryColor; }

    public String getTagline() { return tagline; }
    public void setTagline(String tagline) { this.tagline = tagline; }

    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant updatedAt) { this.updatedAt = updatedAt; }
}
