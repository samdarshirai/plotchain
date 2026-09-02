package com.plotchain.stats;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.sales.AdminSalePageResponse;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleResponse;
import com.plotchain.sales.SaleService;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.WalletRepository;
import com.plotchain.withdrawal.WithdrawalRequestRepository;
import com.plotchain.cycle.Cycle;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
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
    @MockBean SaleRepository saleRepository;
    @MockBean WithdrawalRequestRepository withdrawalRequestRepository;
    @MockBean PlotRepository plotRepository;
    @MockBean SaleService saleService;

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
        when(withdrawalRequestRepository.countByStatus(com.plotchain.withdrawal.WithdrawalRequestStatus.REQUESTED))
            .thenReturn(2L);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.empty());
        when(plotRepository.countByStatusNot(PlotStatus.SOLD)).thenReturn(21L);
        when(saleRepository.countByStatus(SaleStatus.RECORDED)).thenReturn(63L);
        when(cycleRepository.countByStatusIn(List.of(CycleStatus.CLOSED, CycleStatus.PAID))).thenReturn(11L);
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any())).thenReturn(Page.empty());
        when(saleService.list(null, null, null, null, 0, 5))
            .thenReturn(new AdminSalePageResponse(List.of(), 0, 5, 0));

        mockMvc.perform(get("/api/admin/stats")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalAssociates").value(50))
            .andExpect(jsonPath("$.totalWalletBalance").value(999.99))
            .andExpect(jsonPath("$.pendingWithdrawals").value(2))
            .andExpect(jsonPath("$.currentCycle").doesNotExist())
            .andExpect(jsonPath("$.activePlots").value(21))
            .andExpect(jsonPath("$.totalSalesRecorded").value(63))
            .andExpect(jsonPath("$.cyclesCompleted").value(11))
            .andExpect(jsonPath("$.networkGrowth").isEmpty())
            .andExpect(jsonPath("$.recentSales").isEmpty());
    }

    // The test above only ever exercises the empty-cycle/empty-network-growth/empty-recentSales
    // path, so nothing executable actually checks the wire field names
    // (cycleLabel/associateCount/previousCycleTotalIncome/incomeTrend/associateUserId/
    // associateName) that the frontend's admin-dashboard.model.ts/sale.model.ts were hand-written
    // against. This test stubs a populated OPEN cycle, one network-growth point, and one recent
    // sale, and asserts those field names round-trip correctly through JSON. It deliberately does
    // NOT re-verify computation correctness -- that's AdminStatsServiceTest's job.
    @Test
    void returnsPopulatedNetworkGrowthRecentSalesAndCurrentCycleTrendFieldsInTheJson() throws Exception {
        when(associateRepository.countByRole(AssociateRole.ASSOCIATE)).thenReturn(50L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, com.plotchain.associate.KycStatus.PENDING)).thenReturn(1L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, com.plotchain.associate.KycStatus.VERIFIED)).thenReturn(48L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, com.plotchain.associate.KycStatus.REJECTED)).thenReturn(1L);
        when(walletRepository.sumAllBalances()).thenReturn(new BigDecimal("999.99"));
        when(withdrawalRequestRepository.countByStatus(com.plotchain.withdrawal.WithdrawalRequestStatus.REQUESTED))
            .thenReturn(2L);
        when(plotRepository.countByStatusNot(PlotStatus.SOLD)).thenReturn(21L);
        when(saleRepository.countByStatus(SaleStatus.RECORDED)).thenReturn(63L);
        when(cycleRepository.countByStatusIn(List.of(CycleStatus.CLOSED, CycleStatus.PAID))).thenReturn(11L);

        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));
        cycle.setStatus(CycleStatus.OPEN);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any())).thenReturn(new PageImpl<>(List.of(cycle)));
        when(associateRepository.countByRoleAndJoinedBefore(any(), any())).thenReturn(7L);
        when(associateRepository.countByRoleAndJoinedBetween(any(), any(), any())).thenReturn(3L);
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(any(), any())).thenReturn(new BigDecimal("100.00"));
        when(ledgerEntryRepository.sumNetAmountByCycle(any())).thenReturn(new BigDecimal("500.00"));
        when(saleRepository.countByCycleIdAndStatus(any(), any())).thenReturn(4L);
        when(saleRepository.sumAmountByCycleIdAndStatus(any(), any())).thenReturn(new BigDecimal("1500.00"));

        SaleResponse sale = new SaleResponse(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
            "Buyer Name", "9999999999", "buyer@example.com",
            new BigDecimal("1000.00"), cycle.getId(), "LEFT", "RECORDED", null,
            java.time.Instant.now(), "P-1", "Green Acres", "VP00001", "Jane Associate", "Sold to Buyer Name");
        when(saleService.list(null, null, null, null, 0, 5))
            .thenReturn(new AdminSalePageResponse(List.of(sale), 0, 5, 1));

        mockMvc.perform(get("/api/admin/stats")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.networkGrowth[0].cycleLabel").isString())
            .andExpect(jsonPath("$.networkGrowth[0].associateCount").value(7))
            .andExpect(jsonPath("$.currentCycle.previousCycleTotalIncome").exists())
            .andExpect(jsonPath("$.currentCycle.incomeTrend[0]").exists())
            .andExpect(jsonPath("$.recentSales[0].associateUserId").value("VP00001"))
            .andExpect(jsonPath("$.recentSales[0].associateName").value("Jane Associate"));
    }

    @Test
    void returns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/admin/stats"))
            .andExpect(status().isUnauthorized());
    }
}
