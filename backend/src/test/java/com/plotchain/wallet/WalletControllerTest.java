package com.plotchain.wallet;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// MockMvc + real JWT via JwtService, mirroring AssociateLedgerControllerTest's/
// DashboardControllerTest's shape -- the real Spring Security filter chain runs, so this also
// proves the 401 case end to end. SecurityConfigTest additionally covers reachability by an
// ordinary associate token across the full route matrix; this file focuses on this controller's
// own request/response shape.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WalletControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean WalletRepository walletRepository;

    // Unlike a role-only tokenFor(role) (which mints a random associateId per call), this test
    // needs to know the associateId ahead of time -- it's how we prove WalletController resolves
    // the caller's OWN id from the JWT, not from a request parameter (this endpoint accepts
    // none). associateRepository.findById is stubbed here too because
    // JwtAuthenticationFilter -> AssociateStatusCache calls it on every request to confirm the
    // associate isn't suspended -- same wiring as DashboardControllerTest/
    // AssociateLedgerControllerTest.
    private String tokenFor(UUID associateId) {
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    // Wallet has no setter/constructor for balance by design (Decision 5 -- balance mutation is
    // atomic-UPDATE-only, never entity dirty-checking), so a non-zero fixture is built via
    // ReflectionTestUtils, the same pattern DashboardServiceTest already uses elsewhere in this
    // codebase for private fields with no setter (see its LegVolume field-setting calls).
    private Wallet walletWithBalance(UUID associateId, String balance) {
        Wallet wallet = Wallet.zero(associateId);
        ReflectionTestUtils.setField(wallet, "balance", new BigDecimal(balance));
        return wallet;
    }

    @Test
    void getMyWalletReturnsTheCallersBalanceWhenAWalletRowExists() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(walletRepository.findById(associateId))
            .thenReturn(Optional.of(walletWithBalance(associateId, "1250.50")));

        mockMvc.perform(get("/api/associates/me/wallet")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.balance").value(1250.50));
    }

    // The lazy-default case: an associate with no prior Wallet row (never credited) gets a
    // balance of zero, not a 404 -- Decision 13 / Flow step 2.
    @Test
    void getMyWalletReturnsZeroWhenNoWalletRowExistsYet() throws Exception {
        UUID associateId = UUID.randomUUID();
        when(walletRepository.findById(associateId)).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/associates/me/wallet")
                .header("Authorization", "Bearer " + tokenFor(associateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.balance").value(0));
    }

    // Proves the balance shown is always the caller's own: two different associate tokens against
    // two different stubbed wallets each see only their own row.
    @Test
    void getMyWalletReturnsADifferentBalanceForADifferentCaller() throws Exception {
        UUID firstAssociateId = UUID.randomUUID();
        UUID secondAssociateId = UUID.randomUUID();
        when(walletRepository.findById(firstAssociateId))
            .thenReturn(Optional.of(walletWithBalance(firstAssociateId, "100.00")));
        when(walletRepository.findById(secondAssociateId))
            .thenReturn(Optional.of(walletWithBalance(secondAssociateId, "999.99")));

        mockMvc.perform(get("/api/associates/me/wallet")
                .header("Authorization", "Bearer " + tokenFor(firstAssociateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.balance").value(100.00));

        mockMvc.perform(get("/api/associates/me/wallet")
                .header("Authorization", "Bearer " + tokenFor(secondAssociateId)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.balance").value(999.99));
    }

    @Test
    void getMyWalletReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/wallet"))
            .andExpect(status().isUnauthorized());
    }
}
