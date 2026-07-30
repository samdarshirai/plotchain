package com.plotchain.company;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.time.Duration;

@RestController
@RequestMapping("/api/company/branding")
public class CompanyBrandingController {

    private final CompanyBrandingService companyBrandingService;

    public CompanyBrandingController(CompanyBrandingService companyBrandingService) {
        this.companyBrandingService = companyBrandingService;
    }

    @GetMapping
    public CompanyBrandingResponse getBranding() {
        return companyBrandingService.getBranding();
    }

    @PutMapping
    public CompanyBrandingResponse updateBranding(@Valid @RequestBody CompanyBrandingRequest request) {
        return companyBrandingService.updateBranding(request);
    }

    // {variant:square|wide} constrains the path segment at the mapping level: any other value
    // never matches this handler and 404s via Spring's normal "no matching handler" path,
    // rather than a custom JSON 400 -- simpler and idiomatic for a fixed two-value enum.
    @PostMapping("/logo/{variant:square|wide}")
    public ResponseEntity<Void> uploadLogo(@PathVariable String variant, @RequestParam("file") MultipartFile file) {
        companyBrandingService.uploadLogo(variant, file);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/logo/{variant:square|wide}")
    public ResponseEntity<byte[]> getLogo(@PathVariable String variant) {
        return companyBrandingService.getLogo(variant)
            .map(CompanyBrandingController::toBytesResponse)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // Deliberately proxies the square logo only, no fallback to the wide logo -- cropping a
    // wide banner into a favicon shape needs image processing, which this phase avoids adding.
    @GetMapping("/favicon")
    public ResponseEntity<byte[]> getFavicon() {
        return companyBrandingService.getLogo("square")
            .map(CompanyBrandingController::toBytesResponse)
            .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @GetMapping("/public")
    public CompanyBrandingPublicResponse getPublicBranding() {
        return companyBrandingService.getPublicBranding();
    }

    private static ResponseEntity<byte[]> toBytesResponse(LogoBytes logo) {
        return ResponseEntity.ok()
            .contentType(MediaType.parseMediaType(logo.contentType()))
            .cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
            .body(logo.data());
    }
}
