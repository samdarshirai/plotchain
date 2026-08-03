package com.plotchain.stats;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.wallet.WalletRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the 4 repository INTERFACES (not on the concrete AdminStatsService) so this runs
// a real AdminStatsService inside a real Spring Security filter chain -- proving auth actually
// gates this route -- while avoiding the JDK25/ByteBuddy concrete-class-mocking issue entirely
// (interfaces mock fine; see DashboardControllerTest for the same reasoning).
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminStatsControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean WalletRepository walletRepository;
    @MockBean LedgerEntryRepository ledgerEntryRepository;
    @MockBean CycleRepository cycleRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        // JwtAuthenticationFilter checks AssociateStatusCache, which loads status via
        // associateRepository.findById -- must be stubbed or every request 401s regardless of
        // token validity (same reasoning as SecurityConfigTest#tokenFor).
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void returnsCompanyWideStatsJsonForAnAdminToken() throws Exception {
        when(associateRepository.countByRole(AssociateRole.ASSOCIATE)).thenReturn(50L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, com.plotchain.associate.KycStatus.PENDING)).thenReturn(1L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, com.plotchain.associate.KycStatus.VERIFIED)).thenReturn(48L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, com.plotchain.associate.KycStatus.REJECTED)).thenReturn(1L);
        when(walletRepository.sumAllBalances()).thenReturn(new BigDecimal("999.99"));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.empty());

        mockMvc.perform(get("/api/admin/stats")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalAssociates").value(50))
            .andExpect(jsonPath("$.totalWalletBalance").value(999.99))
            .andExpect(jsonPath("$.currentCycle").doesNotExist());
    }

    @Test
    void returns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/stats"))
            .andExpect(status().isUnauthorized());
    }
}
