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
                // Admin Team creation is narrower than the blanket POST rule below: only
                // ADMIN/SUPER_ADMIN may provision new admin-family accounts (FINANCE,
                // KYC_REVIEWER, and SUPPORT can read the roster/permissions via the GET block
                // further down, but must not be able to create new admin accounts themselves).
                // Must precede the blanket rule (first-match-wins) or it would never be reached.
                .requestMatchers(HttpMethod.POST, "/api/company/admins")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN")
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
                // Same reasoning as setup-state/profile/branding above: GET
                // /api/company/compensation and its history stay admin-family-only. PUT
                // /api/company/compensation is a write and is already covered by the blanket
                // PUT rule above -- deliberately no separate matcher for it.
                .requestMatchers(HttpMethod.GET, "/api/company/compensation", "/api/company/compensation/history")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // Same reasoning as setup-state/profile/branding/compensation above: Phase 7's
                // four Payments & KYC GETs stay admin-family-only. Their PUTs are writes,
                // already covered by the blanket PUT rule above -- deliberately no separate
                // matchers for them.
                .requestMatchers(HttpMethod.GET,
                        "/api/company/payments", "/api/company/payout-account",
                        "/api/company/kyc", "/api/company/withdrawal", "/api/company/booking-emi")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // Same reasoning as setup-state/profile/branding/compensation/payments above:
                // Phase 9's Projects & Plots GETs stay admin-family-only. Their POST/PUT/DELETE
                // (including the CSV validate/commit endpoints, which are POSTs) are writes,
                // already covered by the blanket write rules above -- deliberately no separate
                // matchers for them.
                .requestMatchers(HttpMethod.GET,
                        "/api/company/projects", "/api/company/projects/*",
                        "/api/company/projects/*/plots", "/api/company/projects/*/plots/*",
                        "/api/company/projects/*/thumbnail", "/api/company/projects/plots/csv-template")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects
                // above: Phase 10's Admin Team GETs (roster, userId availability check, and the
                // read-only role-permissions preview) stay admin-family-only. The narrower
                // ADMIN/SUPER_ADMIN-only POST that creates admin accounts is declared separately
                // above, next to the other blanket write rules -- deliberately no separate
                // matcher needed here for it.
                .requestMatchers(HttpMethod.GET,
                        "/api/company/admins", "/api/company/admins/user-id-available",
                        "/api/company/admins/role-permissions")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects/
                // admin-team above: Phase 11's Root Associates GET stays admin-family-only. The
                // POST that creates a root is a write and is already covered by the blanket POST
                // rule above -- deliberately no separate matcher for it (unlike Admin Team's
                // narrower POST, there is no stated reason to restrict root-associate creation
                // beyond the standard admin-family write rule).
                .requestMatchers(HttpMethod.GET, "/api/company/root-associates")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects/
                // admin-team/root-associates above: the audit-log GET stays admin-family-only.
                // There is no mutating endpoint for this resource at all (append-only, written
                // internally by SettingsAuditService) -- deliberately no write matcher.
                .requestMatchers(HttpMethod.GET, "/api/company/audit-log")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // Backs the Create Associate form's parent-picker dropdown: same admin-family
                // reasoning as the GETs above. POST /api/associates is a write and is already
                // covered by the blanket POST rule above -- deliberately no separate matcher.
                .requestMatchers(HttpMethod.GET, "/api/associates")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                // Admin Usage: Associate Directory, Tree Explorer, and KYC Review Queue GETs
                // stay admin-family-only, same reasoning as every other admin-only GET above.
                // Their mutating POSTs (suspend/reactivate/reset-password/kyc decision) are
                // covered by the blanket POST rule above for the admin-family baseline, then
                // narrowed further per-role by @PreAuthorize on the controller methods
                // themselves (AdminAssociateController, KycReviewController) -- the first use
                // of real per-role narrowing in this codebase, per AdminRolePermissions' stated
                // follow-up.
                .requestMatchers(HttpMethod.GET, "/api/admin/associates", "/api/admin/associates/*")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                .requestMatchers(HttpMethod.GET, "/api/admin/tree/*")
                    .hasAnyAuthority("ADMIN", "SUPER_ADMIN", "FINANCE", "KYC_REVIEWER", "SUPPORT")
                .requestMatchers(HttpMethod.GET, "/api/admin/kyc")
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
