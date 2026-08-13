package com.plotchain.associate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "associate_kyc_document")
public class AssociateKycDocument {

    @Id
    private UUID id;

    @Column(name = "associate_id", nullable = false)
    private UUID associateId;

    @Column(name = "document_type", nullable = false)
    private String documentType;

    // Plain byte[] with no @Lob: Hibernate 6 maps an unannotated byte[] to VARBINARY, which
    // PostgreSQLDialect renders as bytea, matching the V19 column -- same reasoning as
    // CompanyBranding.logoSquare/logoWide. @Lob on a byte[] maps to BLOB instead, which
    // Postgres backs with oid large-object semantics, a mismatch that fails
    // ddl-auto: validate against a plain BYTEA column.
    @Column(name = "content", nullable = false)
    private byte[] content;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public String getDocumentType() { return documentType; }
    public void setDocumentType(String documentType) { this.documentType = documentType; }
    public byte[] getContent() { return content; }
    public void setContent(byte[] content) { this.content = content; }
    public String getContentType() { return contentType; }
    public void setContentType(String contentType) { this.contentType = contentType; }
    public Instant getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(Instant uploadedAt) { this.uploadedAt = uploadedAt; }
}
