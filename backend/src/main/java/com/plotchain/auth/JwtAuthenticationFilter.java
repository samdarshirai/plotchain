package com.plotchain.auth;

import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatusCache;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;
    private final AssociateStatusCache associateStatusCache;

    public JwtAuthenticationFilter(JwtService jwtService, AssociateStatusCache associateStatusCache) {
        this.jwtService = jwtService;
        this.associateStatusCache = associateStatusCache;
    }

    // MANAGER holds every ADMIN power (so all hasAuthority("ADMIN") gates pass) plus its own
    // MANAGER marker, which AdminUserService/SettingsAuditService use to hide ADMIN users.
    static List<SimpleGrantedAuthority> authorities(AssociateRole role) {
        return role == AssociateRole.MANAGER
            ? List.of(new SimpleGrantedAuthority("ADMIN"), new SimpleGrantedAuthority("MANAGER"))
            : List.of(new SimpleGrantedAuthority(role.name()));
    }

    @Override
    protected void doFilterInternal(
        @NonNull HttpServletRequest request,
        @NonNull HttpServletResponse response,
        @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith(BEARER_PREFIX)) {
            String token = header.substring(BEARER_PREFIX.length());
            // Single parse/verify per request: a malformed-but-signed token (no role claim,
            // non-UUID subject) must fall through to "unauthenticated", never throw. A
            // well-formed token for a since-suspended associate falls through the same way --
            // AssociateStatusCache is what makes suspend take effect before the token expires.
            jwtService.authenticate(token).ifPresent(authenticated -> {
                if (!associateStatusCache.isActive(authenticated.associateId())) {
                    return;
                }
                var authentication = new UsernamePasswordAuthenticationToken(
                    authenticated.associateId(), null,
                    authorities(authenticated.role()));
                SecurityContextHolder.getContext().setAuthentication(authentication);
            });
        }
        filterChain.doFilter(request, response);
    }
}
