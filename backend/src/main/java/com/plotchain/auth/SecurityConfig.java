package com.plotchain.auth;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Ordering matters: Spring Security matches first-wins, so the login
                // permitAll() must be declared before the blanket write-authorization rules
                // below, or POST /api/auth/login would be swallowed by the ADMIN-only POST
                // rule and login itself would break.
                .requestMatchers(HttpMethod.POST, "/api/auth/login").permitAll()
                // Self-service password change: an associate-reachable POST. Must precede the
                // blanket ADMIN write rules below (first-match-wins) or associates could never
                // clear their must-change-password state. SecurityConfigTest locks this.
                .requestMatchers(HttpMethod.POST, "/api/associates/me/password").authenticated()
                // Deny-by-default for writes: product policy is "admin (or staff) can write;
                // associates are read-only except their own profile". Without this, any future
                // POST/PUT/PATCH/DELETE endpoint would be reachable by every authenticated
                // associate unless its author remembered to add @PreAuthorize. When an
                // associate's own-profile write is built, it needs its own explicit matcher
                // placed above these blanket admin-family rules (same ordering trap as login
                // above).
                //
                // hasAnyAuthority, not hasAuthority("ADMIN"): the setup wizard's Admin Team
                // step creates SUPER_ADMIN/FINANCE/KYC_REVIEWER/SUPPORT accounts too
                // (AssociateRole.isAdminFamily() is the canonical list). A plain ADMIN-only
                // rule would lock every one of those roles out of every write in the
                // application -- silently, as 403s that look like a client bug. Per-role
                // narrowing (e.g. only FINANCE can approve withdrawals) is a named follow-up
                // (the setup wizard's Admin Team permission matrix), not assumed here: until
                // then, any admin-family role can write, matching the spec's statement that
                // the founding admin can act as all roles until more accounts are created.
                .requestMatchers(HttpMethod.POST, "/api/**")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                .requestMatchers(HttpMethod.PUT, "/api/**")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                .requestMatchers(HttpMethod.PATCH, "/api/**")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                .requestMatchers(HttpMethod.DELETE, "/api/**")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // The blanket rules above only cover writes; a bare GET falls through to
                // anyRequest().authenticated() below, which any associate token satisfies. The
                // setup wizard's state must stay admin-family-only (associates have no business
                // seeing wizard progress), so it needs its own explicit matcher here, above the
                // catch-all. POST /api/company/launch is a write and is already covered by the
                // blanket POST rule above -- deliberately no separate matcher for it.
                .requestMatchers(HttpMethod.GET, "/api/company/setup-state")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // Same reasoning as setup-state above: GET /api/company/profile must stay
                // admin-family-only. PUT /api/company/profile is a write and is already
                // covered by the blanket PUT rule above -- deliberately no separate matcher.
                .requestMatchers(HttpMethod.GET, "/api/company/profile")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // Same reasoning as setup-state/profile above: GET /api/company/branding stays
                // admin-family-only. PUT and the logo POST are writes, already covered by the
                // blanket PUT/POST rules above -- deliberately no separate matchers for them.
                .requestMatchers(HttpMethod.GET, "/api/company/branding")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // Phase 5's genuinely public endpoints: the pre-login branding bootstrap, the
                // raw logo bytes it and the login page render as <img> tags, and the favicon
                // index.html links to -- all requested before any JWT exists. They only need to
                // precede anyRequest().authenticated() below; a GET never matches the
                // POST/PUT/PATCH/DELETE blanket rules above regardless of file order.
                .requestMatchers(HttpMethod.GET, "/api/company/branding/public").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/company/branding/logo/*").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/company/branding/favicon").permitAll()
                .anyRequest().authenticated())
            .exceptionHandling(ex -> ex.authenticationEntryPoint(
                (request, response, authException) -> response.sendError(HttpServletResponse.SC_UNAUTHORIZED)))
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
        return http.build();
    }
}
