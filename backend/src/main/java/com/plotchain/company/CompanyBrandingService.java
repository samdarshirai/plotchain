package com.plotchain.company;

import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.util.Optional;
import java.util.Set;

@Service
public class CompanyBrandingService {

    private static final Set<String> ALLOWED_LOGO_CONTENT_TYPES =
        Set.of("image/png", "image/jpeg", "image/svg+xml", "image/webp");

    private final CompanyBrandingRepository companyBrandingRepository;
    private final CompanyProfileService companyProfileService;

    public CompanyBrandingService(CompanyBrandingRepository companyBrandingRepository,
                                   CompanyProfileService companyProfileService) {
        this.companyBrandingRepository = companyBrandingRepository;
        this.companyProfileService = companyProfileService;
    }

    public CompanyBrandingResponse getBranding() {
        return toResponse(currentBranding());
    }

    public CompanyBrandingResponse updateBranding(CompanyBrandingRequest request) {
        CompanyBranding branding = currentBranding();
        branding.setPrimaryColor(request.primaryColor());
        branding.setSecondaryColor(request.secondaryColor());
        branding.setTagline(request.tagline());
        branding.setUpdatedAt(Instant.now());
        companyBrandingRepository.save(branding);
        return toResponse(branding);
    }

    public void uploadLogo(String variant, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new InvalidLogoUploadException("logo file is empty");
        }
        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_LOGO_CONTENT_TYPES.contains(contentType)) {
            throw new InvalidLogoUploadException("unsupported logo content type: " + contentType);
        }
        CompanyBranding branding = currentBranding();
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        if ("square".equals(variant)) {
            branding.setLogoSquare(bytes);
            branding.setLogoSquareContentType(contentType);
        } else {
            branding.setLogoWide(bytes);
            branding.setLogoWideContentType(contentType);
        }
        branding.setUpdatedAt(Instant.now());
        companyBrandingRepository.save(branding);
    }

    public Optional<LogoBytes> getLogo(String variant) {
        CompanyBranding branding = currentBranding();
        byte[] data = "square".equals(variant) ? branding.getLogoSquare() : branding.getLogoWide();
        if (data == null) {
            return Optional.empty();
        }
        String contentType = "square".equals(variant)
            ? branding.getLogoSquareContentType()
            : branding.getLogoWideContentType();
        return Optional.of(new LogoBytes(data, contentType));
    }

    public CompanyBrandingPublicResponse getPublicBranding() {
        CompanyBranding branding = currentBranding();
        CompanyProfileResponse profile = companyProfileService.getProfile();
        return new CompanyBrandingPublicResponse(
            profile.displayName(),
            branding.getTagline(),
            branding.getPrimaryColor(),
            branding.getSecondaryColor(),
            branding.getLogoSquare() != null,
            branding.getLogoWide() != null
        );
    }

    // Branding is not required for Go Live (StepDefinition(2, "branding", false)) -- this is
    // purely a progress-rail checkmark. Defined as "did the admin actually customize
    // something" (logo + tagline) rather than "colors differ from the seeded default", since
    // colors always have a value from row one and would make this permanently true.
    public boolean isComplete() {
        CompanyBranding branding = currentBranding();
        return branding.getLogoSquare() != null
            && branding.getTagline() != null && !branding.getTagline().isBlank();
    }

    private CompanyBranding currentBranding() {
        return companyBrandingRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException("company_branding row missing - V7 migration seeds it"));
    }

    private static CompanyBrandingResponse toResponse(CompanyBranding branding) {
        return new CompanyBrandingResponse(
            branding.getPrimaryColor(),
            branding.getSecondaryColor(),
            branding.getTagline(),
            branding.getLogoSquare() != null,
            branding.getLogoWide() != null,
            branding.getUpdatedAt()
        );
    }
}
