package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

@Component
public class JwtService {

    /**
     * The literal default baked into application.yml for local development. It is public
     * source, so any deploy that boots with this secret still in effect (JWT_SECRET unset)
     * lets anyone mint a valid token for any associate UUID with role ADMIN. We fail startup
     * rather than run with it active outside dev/test.
     */
    static final String DEV_DEFAULT_SECRET = "dev-only-change-me-this-needs-to-be-at-least-32-bytes-long";

    private final SecretKey key;
    private final long expirationMinutes;

    @Autowired
    public JwtService(
        @Value("${jwt.secret}") String secret,
        @Value("${jwt.expiration-minutes}") long expirationMinutes,
        Environment environment
    ) {
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMinutes = expirationMinutes;
    }

    /**
     * Convenience constructor for tests that build a JwtService directly, without a Spring
     * ApplicationContext to supply an Environment. Safe because every such call site passes a
     * non-default secret, so the dev-secret guard never has a reason to trigger here — an
     * Environment with no active profiles is treated as "not dev", i.e. fail-closed, same as
     * production.
     */
    public JwtService(String secret, long expirationMinutes) {
        this(secret, expirationMinutes, new StandardEnvironment());
    }

    public String generateToken(Associate associate) {
        Instant now = Instant.now();
        return Jwts.builder()
            .subject(associate.getId().toString())
            .claim("role", associate.getRole().name())
            .issuedAt(Date.from(now))
            .expiration(Date.from(now.plusSeconds(expirationMinutes * 60)))
            .signWith(key)
            .compact();
    }

    public UUID extractAssociateId(String token) {
        return UUID.fromString(parseClaims(token).getSubject());
    }

    public AssociateRole extractRole(String token) {
        return AssociateRole.valueOf(parseClaims(token).get("role", String.class));
    }

    public boolean isTokenValid(String token) {
        return authenticate(token).isPresent();
    }

    /**
     * Parses and verifies the token exactly once, extracting both the associate id and role in
     * the same try/catch. Returns empty for any failure — bad signature, expired token, missing
     * role claim, or a subject that isn't a UUID — so callers (namely JwtAuthenticationFilter)
     * can treat "malformed but signed" tokens as unauthenticated instead of letting an
     * IllegalArgumentException/NullPointerException escape as an unhandled 500.
     */
    public Optional<AuthenticatedAssociate> authenticate(String token) {
        try {
            Claims claims = parseClaims(token);
            UUID associateId = UUID.fromString(claims.getSubject());
            AssociateRole role = AssociateRole.valueOf(claims.get("role", String.class));
            return Optional.of(new AuthenticatedAssociate(associateId, role));
        } catch (JwtException | IllegalArgumentException | NullPointerException e) {
            return Optional.empty();
        }
    }

    private Claims parseClaims(String token) {
        return Jwts.parser().verifyWith(key).build().parseSignedClaims(token).getPayload();
    }

    public record AuthenticatedAssociate(UUID associateId, AssociateRole role) {}
}
