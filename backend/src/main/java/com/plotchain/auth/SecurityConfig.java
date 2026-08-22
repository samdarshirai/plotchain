package com.plotchain.auth;

import jakarta.servlet.http.HttpServletResponse;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

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

    // Frontend is deployed as a separate origin from the backend (e.g. Render static site +
    // web service), so the browser enforces CORS on every /api call. Without an explicit
    // CorsConfigurationSource bean, Spring Security's http.cors(Customizer.withDefaults())
    // falls back to a permissive allow-all-origins default, which is unsafe for a JWT-bearing
    // API (allowCredentials + wildcard origin is also rejected outright by browsers). Origins
    // are env-driven so each deployment can restrict to its own frontend domain.
    @Bean
    public CorsConfigurationSource corsConfigurationSource(
            @Value("${plotchain.cors.allowed-origins}") String allowedOrigins) {
        List<String> origins = Arrays.stream(allowedOrigins.split(","))
            .map(String::trim)
            .filter(origin -> !origin.isEmpty())
            .toList();
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(origins);
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .cors(Customizer.withDefaults())
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
                // Self-service KYC document submission: an associate-reachable POST, same
                // shape as the password-change matcher directly above (role-capability unit 8,
                // docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
                // KYC row: "Own KYC submission + status only" -- submission is one of the two
                // write actions Associates get, alongside profile edit). Must precede the
                // blanket ADMIN write rules below (first-match-wins) or an associate could
                // never submit KYC documents. GET /api/associates/me/kyc needs no matcher of
                // its own -- a bare GET never collides with the POST/PUT/PATCH/DELETE blanket
                // rules, so it falls through to anyRequest().authenticated() below, the same
                // way GET /api/associates/me/dashboard and GET /api/associates/me/sales
                // already do with no matcher of their own.
                .requestMatchers(HttpMethod.POST, "/api/associates/me/kyc/documents/*").authenticated()
                // Self-service profile edit: an associate-reachable PUT (role-capability unit
                // 11, docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
                // "Own profile" row -- name/contact edit is the one write action alongside
                // password change and KYC submission above). Must precede the blanket ADMIN
                // write rules below (first-match-wins) or an associate could never edit their
                // own profile. GET /api/associates/me/profile needs no matcher of its own -- a
                // bare GET never collides with the POST/PUT/PATCH/DELETE blanket rules, so it
                // falls through to anyRequest().authenticated() below, same as GET
                // /api/associates/me/dashboard, GET /api/associates/me/sales, and GET
                // /api/associates/me/kyc already do.
                .requestMatchers(HttpMethod.PUT, "/api/associates/me/profile").authenticated()
                // Deny-by-default for writes: product policy is "ADMIN can write; associates
                // are read-only except their own profile". Without this, any future
                // POST/PUT/PATCH/DELETE endpoint would be reachable by every authenticated
                // associate unless its author remembered to add @PreAuthorize. When an
                // associate's own-profile write is built, it needs its own explicit matcher
                // placed above these blanket rules (same ordering trap as login above).
                //
                // Only one role has back-office authority (role-capability unit 1,
                // docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
                // "Role model" section) -- so the write rule is simply hasAuthority("ADMIN"),
                // not a multi-role hasAnyAuthority(...) list.
                // Cycle close: ADMIN-only, per cycle-management unit 3
                // (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
                // "POST /api/admin/cycles/{id}/close -- ADMIN-only"), same target-role-model
                // reasoning as the GET /api/admin/cycles matcher further down. Declared HERE,
                // before the blanket POST rule, not next to that GET matcher: first-match-wins
                // (see the Admin Team creation comment above) means a narrower POST rule
                // declared after the blanket POST "/api/**" rule below would never be reached --
                // the blanket rule would match first and grant admin-family access instead of
                // the ADMIN-only access this route requires.
                .requestMatchers(HttpMethod.POST, "/api/admin/cycles/*/close")
                    .hasAuthority("ADMIN")
                // Wallet/withdrawal unit 1
                // (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
                // "POST /api/admin/cycles/{id}/credit-wallets, ADMIN-only"): same target-role-model
                // reasoning and first-match-wins placement as the cycle-close matcher directly
                // above -- not load-bearing on its own (the blanket POST rule below already
                // covers it), added for the same readability/grouping reason that matcher
                // documents.
                .requestMatchers(HttpMethod.POST, "/api/admin/cycles/*/credit-wallets")
                    .hasAuthority("ADMIN")
                // Wallet/withdrawal unit 5
                // (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
                // "POST /api/admin/withdrawals, ADMIN-only"): same target-role-model reasoning and
                // first-match-wins placement as the credit-wallets matcher directly above -- not
                // load-bearing on its own (the blanket POST rule below already covers it), added
                // for the same readability/grouping reason that matcher documents.
                .requestMatchers(HttpMethod.POST, "/api/admin/withdrawals")
                    .hasAuthority("ADMIN")
                // Wallet/withdrawal unit 7
                // (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
                // "Decide -- POST /api/admin/withdrawals/{id}/decision, ADMIN-only"): same
                // target-role-model reasoning and first-match-wins placement as the submit
                // matcher directly above -- not load-bearing on its own (the blanket POST rule
                // below already covers it), added for the same readability/grouping reason that
                // matcher documents.
                .requestMatchers(HttpMethod.POST, "/api/admin/withdrawals/*/decision")
                    .hasAuthority("ADMIN")
                // Wallet/withdrawal unit 8
                // (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
                // "Disburse -- POST /api/admin/withdrawals/{id}/disburse, ADMIN-only"): same
                // target-role-model reasoning and first-match-wins placement as the submit/decide
                // matchers directly above -- not load-bearing on its own (the blanket POST rule
                // below already covers it), added for the same readability/grouping reason those
                // matchers document.
                .requestMatchers(HttpMethod.POST, "/api/admin/withdrawals/*/disburse")
                    .hasAuthority("ADMIN")
                // Record a sale: ADMIN-only, per Sales unit 2
                // (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
                // Decision 8 and the Testing section: "record/void/register are ADMIN-only"),
                // same target-role-model reasoning as the cycle close matcher directly above.
                // Declared here, before the blanket POST rule, for the same first-match-wins
                // reason documented on that matcher -- a narrower POST rule declared after the
                // blanket rule below would never be reached. Only POST /api/admin/sales is
                // added here: this unit's own scope is guards only (unknown/unavailable plot or
                // associate rejected before any row is written); the void (unit 4 of the Sales
                // unit queue) and list (unit 6) endpoints don't exist in code yet, so their
                // matchers are deferred to those units rather than added speculatively against
                // routes that would 404 today regardless of the authorization rule.
                .requestMatchers(HttpMethod.POST, "/api/admin/sales")
                    .hasAuthority("ADMIN")
                // Void a sale: ADMIN-only, per Sales unit 4
                // (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
                // Decision 8 and the Testing section: "record/void/register are ADMIN-only"),
                // same target-role-model reasoning as the record-a-sale matcher directly above.
                // Declared here, before the blanket POST rule, for the same first-match-wins
                // reason documented on that matcher -- a narrower POST rule declared after the
                // blanket rule below would never be reached. This unit's own scope is guards
                // only (unknown or already-voided Sale rejected with no side effects); Sales
                // unit 5's actual reversal reuses this same matcher, no security change needed
                // when that unit lands.
                .requestMatchers(HttpMethod.POST, "/api/admin/sales/*/void")
                    .hasAuthority("ADMIN")
                // Admin sales register: ADMIN-only, per Sales unit 6
                // (docs/superpowers/specs/role-capability/2026-08-03-sales-domain-design.md,
                // "Admin register -- GET /api/admin/sales, ADMIN-only" and the Testing section:
                // "record/void/register are ADMIN-only"), same target-role-model pattern as the
                // record/void matchers directly above and GET /api/admin/cycles further down --
                // not the admin-family hasAnyAuthority(...) pattern most other admin GETs still
                // use. Grouped here with the other /api/admin/sales matchers for readability; a
                // GET never collides with the POST/PUT/PATCH/DELETE blanket rules above
                // regardless of placement, so there's no first-match-wins ordering requirement
                // forcing it to live in one spot over the other.
                .requestMatchers(HttpMethod.GET, "/api/admin/sales")
                    .hasAuthority("ADMIN")
                // Book a plot: ADMIN-only, per role-capability unit 7
                // (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
                // Plot/project inventory row, Admin column: "books plots against any associate's
                // record"), same target-role-model reasoning and first-match-wins placement as
                // the Sales matchers directly above -- not load-bearing on its own (the blanket
                // POST rule below already covers it), added for the same readability/grouping
                // reason those Sales matchers document.
                .requestMatchers(HttpMethod.POST, "/api/admin/bookings")
                    .hasAuthority("ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/**")
                    .hasAuthority("ADMIN")
                .requestMatchers(HttpMethod.PUT, "/api/**")
                    .hasAuthority("ADMIN")
                .requestMatchers(HttpMethod.PATCH, "/api/**")
                    .hasAuthority("ADMIN")
                .requestMatchers(HttpMethod.DELETE, "/api/**")
                    .hasAuthority("ADMIN")
                // The blanket rules above only cover writes; a bare GET falls through to
                // anyRequest().authenticated() below, which any associate token satisfies. The
                // setup wizard's state must stay admin-family-only (associates have no business
                // seeing wizard progress), so it needs its own explicit matcher here, above the
                // catch-all. POST /api/company/launch is a write and is already covered by the
                // blanket POST rule above -- deliberately no separate matcher for it.
                .requestMatchers(HttpMethod.GET, "/api/company/setup-state")
                    .hasAuthority("ADMIN")
                // Same reasoning as setup-state above: GET /api/company/profile must stay
                // admin-family-only. PUT /api/company/profile is a write and is already
                // covered by the blanket PUT rule above -- deliberately no separate matcher.
                .requestMatchers(HttpMethod.GET, "/api/company/profile")
                    .hasAuthority("ADMIN")
                // Same reasoning as setup-state/profile above: GET /api/company/branding stays
                // admin-family-only. PUT and the logo POST are writes, already covered by the
                // blanket PUT/POST rules above -- deliberately no separate matchers for them.
                .requestMatchers(HttpMethod.GET, "/api/company/branding")
                    .hasAuthority("ADMIN")
                // Same reasoning as setup-state/profile/branding above: GET
                // /api/company/compensation and its history stay admin-family-only. PUT
                // /api/company/compensation is a write and is already covered by the blanket
                // PUT rule above -- deliberately no separate matcher for it.
                .requestMatchers(HttpMethod.GET, "/api/company/compensation", "/api/company/compensation/history")
                    .hasAuthority("ADMIN")
                // Same reasoning as setup-state/profile/branding/compensation above: Phase 7's
                // four Payments & KYC GETs stay admin-family-only. Their PUTs are writes,
                // already covered by the blanket PUT rule above -- deliberately no separate
                // matchers for them.
                .requestMatchers(HttpMethod.GET,
                        "/api/company/payments", "/api/company/payout-account",
                        "/api/company/kyc", "/api/company/withdrawal", "/api/company/booking-emi",
                        "/api/company/self-performance-bonus")
                    .hasAuthority("ADMIN")
                // Associate-reachable: the plot catalog is what the matrix calls "View available
                // plots" for an Associate. Thumbnail and the CSV import template stay admin-only
                // -- they're back-office affordances, not part of what an Associate browses.
                .requestMatchers(HttpMethod.GET,
                        "/api/company/projects", "/api/company/projects/*",
                        "/api/company/projects/*/plots", "/api/company/projects/*/plots/*")
                    .authenticated()
                .requestMatchers(HttpMethod.GET,
                        "/api/company/projects/*/thumbnail", "/api/company/projects/plots/csv-template")
                    .hasAuthority("ADMIN")
                // Same reasoning as setup-state/profile/branding/compensation/payments/projects
                // above: the audit-log GET stays admin-family-only. There is no
                // mutating endpoint for this resource at all (append-only, written internally by
                // SettingsAuditService) -- deliberately no write matcher.
                .requestMatchers(HttpMethod.GET, "/api/company/audit-log")
                    .hasAuthority("ADMIN")
                // Backs the Create Associate form's parent-picker dropdown: same admin-family
                // reasoning as the GETs above. POST /api/associates is a write and is already
                // covered by the blanket POST rule above -- deliberately no separate matcher.
                .requestMatchers(HttpMethod.GET, "/api/associates")
                    .hasAuthority("ADMIN")
                // Admin Usage: Associate Directory, Tree Explorer, and KYC Review Queue GETs
                // stay admin-family-only, same reasoning as every other admin-only GET above.
                // Their mutating POSTs (suspend/reactivate/reset-password/kyc decision) are
                // covered by the blanket POST rule above for the admin-family baseline, then
                // narrowed further per-role by @PreAuthorize on the controller methods
                // themselves (AdminAssociateController, KycReviewController) -- the first use
                // of real per-role narrowing in this codebase.
                .requestMatchers(HttpMethod.GET, "/api/admin/associates", "/api/admin/associates/*")
                    .hasAuthority("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/admin/tree/*")
                    .hasAuthority("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/admin/kyc")
                    .hasAuthority("ADMIN")
                // Company-wide admin stats: same admin-family-only reasoning as every other
                // admin-aggregate GET above. Read-only, no corresponding write endpoint.
                .requestMatchers(HttpMethod.GET, "/api/admin/stats")
                    .hasAuthority("ADMIN")
                // Admin cycle history: ADMIN-only, not the admin-family hasAnyAuthority(...)
                // pattern every other admin GET above still uses. Built directly to the target
                // role model from role-capability unit 1 (approved, not yet implemented) rather
                // than to the pattern that spec deletes. Read-only; the write counterpart, POST
                // /api/admin/cycles/{id}/close (cycle-management unit 3), has its own ADMIN-only
                // matcher declared up near the other narrower POST rules, above the blanket
                // POST "/api/**" rule -- not here, since first-match-wins would otherwise let
                // the blanket rule swallow it (see that matcher's own comment for why).
                .requestMatchers(HttpMethod.GET, "/api/admin/cycles")
                    .hasAuthority("ADMIN")
                // Cycle detail (monitor half of trigger/monitor/re-run): ADMIN-only,
                // cycle-management unit 2
                // (docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md,
                // lines 95-97). Separate matcher from the list route directly above --
                // "/api/admin/cycles" is an exact match in Spring Security's AntPathMatcher and
                // does NOT cover "/api/admin/cycles/{id}" as a prefix, so without this line the
                // detail route would fall through to the blanket anyRequest().authenticated()
                // below and be reachable by any authenticated associate, not just ADMIN.
                .requestMatchers(HttpMethod.GET, "/api/admin/cycles/*")
                    .hasAuthority("ADMIN")
                // Admin ledger register: ADMIN-only, Income/Ledger unit 1
                // (docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md,
                // "Admin ledger register -- GET /api/admin/ledger, ADMIN-only" and the Testing
                // section: "associate token gets 403"), same target-role-model pattern as GET
                // /api/admin/cycles directly above and GET /api/admin/sales further up -- not the
                // admin-family hasAnyAuthority(...) pattern most other admin GETs still use. A GET
                // never collides with the POST/PUT/PATCH/DELETE blanket rules above, so there's
                // no first-match-wins ordering requirement forcing this matcher to live in any
                // one spot.
                .requestMatchers(HttpMethod.GET, "/api/admin/ledger")
                    .hasAuthority("ADMIN")
                // Admin withdrawal approval queue: ADMIN-only, Wallet/withdrawal unit 6
                // (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
                // "Approval queue -- GET /api/admin/withdrawals, ADMIN-only"), same
                // target-role-model pattern as GET /api/admin/ledger directly above. A GET never
                // collides with the POST/PUT/PATCH/DELETE blanket rules above, so there's no
                // first-match-wins ordering requirement forcing this matcher to live in any one
                // spot -- grouped here with the other admin-list GETs for readability.
                .requestMatchers(HttpMethod.GET, "/api/admin/withdrawals")
                    .hasAuthority("ADMIN")
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
