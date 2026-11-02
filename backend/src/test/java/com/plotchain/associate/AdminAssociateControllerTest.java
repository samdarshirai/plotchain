package com.plotchain.associate;

import com.plotchain.auth.AuthService;
import com.plotchain.auth.ImpersonationNotAllowedException;
import com.plotchain.auth.JwtService;
import com.plotchain.auth.LoginResponse;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleService;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.domain.PageImpl;
import static org.mockito.ArgumentMatchers.anyBoolean;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AdminAssociateControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AuthService authService;
    @MockBean AssociateRepository associateRepository;
    @MockBean RankTierRepository rankTierRepository;
    @MockBean CycleRepository cycleRepository;
    @MockBean LegVolumeRepository legVolumeRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;
    @MockBean CycleService cycleService;
    @MockBean AssociateBankDetailsRepository bankDetailsRepository;
    @MockBean AssociateNomineeRepository nomineeRepository;

    private static final UUID ASSOCIATE_ID = UUID.randomUUID();
    private final RankTier rank = new RankTier(UUID.randomUUID(), "Sales Associate", 1, BigDecimal.valueOf(5000));

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        // Configure the mock to return this ACTIVE associate when queried during filter authentication
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    private Associate seedAssociate() {
        Associate a = new Associate();
        a.setId(ASSOCIATE_ID);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setRankId(rank.getId());
        a.setKycStatus(KycStatus.PENDING);
        a.setStatus(AssociateStatus.ACTIVE);
        a.setJoinedAt(Instant.now());
        a.setPasswordHash("hash");
        a.setPhone("9876543210");
        a.setPanNumber("ABCDE1234F");
        a.setAadhaarNumber("123412341234");
        return a;
    }

    @Test
    void listReturnsAPageForAnyAdminFamilyToken() throws Exception {
        when(associateRepository.searchDirectory(any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(seedAssociate()), PageRequest.of(0, 20), 1));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(rank));

        mockMvc.perform(get("/api/admin/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.associates[0].userId").value("VP00001"))
            .andExpect(jsonPath("$.associates[0].phone").value("9876543210"))
            .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/admin/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void listClampsAnOversizedPageSizeToTheServerSideMaximum() throws Exception {
        when(associateRepository.searchDirectory(any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 100), 0));

        mockMvc.perform(get("/api/admin/associates").param("size", "999999")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        ArgumentCaptor<PageRequest> pageableCaptor = ArgumentCaptor.forClass(PageRequest.class);
        verify(associateRepository).searchDirectory(any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(100);
    }

    @Test
    void listClampsANegativePageToZeroInsteadOfThrowing() throws Exception {
        when(associateRepository.searchDirectory(any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(), any()))
            .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/admin/associates").param("page", "-5")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        ArgumentCaptor<PageRequest> pageableCaptor = ArgumentCaptor.forClass(PageRequest.class);
        verify(associateRepository).searchDirectory(any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageNumber()).isEqualTo(0);
    }

    @Test
    void suspendSucceedsForAnAdminToken() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE))
            .thenReturn(Optional.of(seedAssociate()));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("SUSPENDED"));
    }

    @Test
    void suspendIsForbiddenForAnAssociateToken() throws Exception {
        // 403 proves @PreAuthorize narrowing is still in force: ASSOCIATE is blocked twice over
        // (the blanket POST rule and this method's own @PreAuthorize), same reasoning the old
        // FINANCE-token test used to prove before FINANCE existed as a role.
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void resetPasswordIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/reset-password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void resetTransactionPasswordReturnsAGeneratedPasswordForAnAdminToken() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE))
            .thenReturn(Optional.of(seedAssociate()));

        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/reset-transaction-password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.temporaryPassword").isString());
    }

    @Test
    void resetTransactionPasswordIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/reset-transaction-password")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void tokenForANewlySuspendedAssociateIsRejectedOnTheVeryNextRequest() throws Exception {
        // Uses a freshly generated id rather than the shared ASSOCIATE_ID constant: the real
        // AssociateStatusCache is a singleton Spring bean shared across every test in this
        // class, so reusing a constant id risks a stale cached entry leaking in from another
        // test's execution order.
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setUserId("VP00099");
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setStatus(AssociateStatus.ACTIVE);
        when(associateRepository.findById(id)).thenReturn(Optional.of(associate));
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());
        String associateToken = jwtService.generateToken(associate);

        mockMvc.perform(post("/api/admin/associates/" + id + "/suspend")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk());

        // No role restriction on this endpoint in SecurityConfig -- any authenticated principal
        // can reach it, so a 401 here proves the auth layer (real AssociateStatusCache) rejected
        // the request, not a role-based 403 that would happen even if eviction were broken.
        mockMvc.perform(get("/api/associates/me/dashboard")
                .header("Authorization", "Bearer " + associateToken))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void impersonateReturnsLoginResponseForAdmin() throws Exception {
        UUID adminId = UUID.randomUUID();
        Associate admin = new Associate();
        admin.setId(adminId);
        admin.setRole(AssociateRole.ADMIN);
        when(associateRepository.findById(adminId)).thenReturn(Optional.of(admin));
        when(authService.impersonate(ASSOCIATE_ID, adminId))
            .thenReturn(new LoginResponse("tok", ASSOCIATE_ID, "ASSOCIATE", false));

        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/impersonate")
                .header("Authorization", "Bearer " + jwtService.generateToken(admin)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.token").value("tok"))
            .andExpect(jsonPath("$.associateId").value(ASSOCIATE_ID.toString()))
            .andExpect(jsonPath("$.role").value("ASSOCIATE"));
    }

    @Test
    void impersonateMapsNotAllowedTo409() throws Exception {
        UUID adminId = UUID.randomUUID();
        Associate admin = new Associate();
        admin.setId(adminId);
        admin.setRole(AssociateRole.ADMIN);
        when(associateRepository.findById(adminId)).thenReturn(Optional.of(admin));
        when(authService.impersonate(ASSOCIATE_ID, adminId)).thenThrow(new ImpersonationNotAllowedException());

        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/impersonate")
                .header("Authorization", "Bearer " + jwtService.generateToken(admin)))
            .andExpect(status().isConflict())
            .andExpect(content().json("{\"error\":\"Only associate accounts can be impersonated\"}"));
    }

    @Test
    void recalculateRefreshesOpenCyclesForAnAdminToken() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE))
            .thenReturn(Optional.of(seedAssociate()));
        when(rankTierRepository.findById(rank.getId())).thenReturn(Optional.of(rank));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/recalculate")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.userId").value("VP00001"));

        verify(cycleService).refreshAllOpenCycles();
    }

    @Test
    void recalculateIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(post("/api/admin/associates/" + ASSOCIATE_ID + "/recalculate")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());

        verify(cycleService, never()).refreshAllOpenCycles();
    }

    private static final String PROFILE_JSON = """
        {"name":"Jane Doe","phone":"9876543210","panNumber":"%s","aadhaarNumber":"%s"}""";

    @Test
    void adminProfileUpdateChangesPanAndAadhaar() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        when(associateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(PROFILE_JSON.formatted("ZZZZZ9999Z", "999988887777")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.panNumber").value("ZZZZZ9999Z"))
            .andExpect(jsonPath("$.aadhaarNumber").value("999988887777"));
    }

    @Test
    void adminProfileUpdateRejectsAPanAlreadyUsedByAnotherAssociate() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        when(associateRepository.existsByPanNumber("ZZZZZ9999Z")).thenReturn(true);

        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(PROFILE_JSON.formatted("ZZZZZ9999Z", "123412341234")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("PAN_TAKEN"));
        verify(associateRepository, never()).save(any());
    }

    @Test
    void adminProfileUpdateRejectsAnAadhaarAlreadyUsedByAnotherAssociate() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        when(associateRepository.existsByAadhaarNumber("999988887777")).thenReturn(true);

        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(PROFILE_JSON.formatted("ABCDE1234F", "999988887777")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.code").value("AADHAAR_TAKEN"));
        verify(associateRepository, never()).save(any());
    }

    @Test
    void adminProfileUpdateKeepingTheSamePanDoesNotTripTheDuplicateCheck() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        when(associateRepository.existsByPanNumber("ABCDE1234F")).thenReturn(true); // it's this associate's own PAN
        when(associateRepository.existsByAadhaarNumber("123412341234")).thenReturn(true);
        when(associateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(PROFILE_JSON.formatted("ABCDE1234F", "123412341234")))
            .andExpect(status().isOk());
    }

    @Test
    void adminProfileUpdateRejectsAMalformedPan() throws Exception {
        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(PROFILE_JSON.formatted("abc", "123412341234")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void managerCanChangeContactDetailsOnly() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        when(associateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.MANAGER))
                .contentType("application/json")
                .content("""
                    {"name":"Jane Doe","phone":"9000000000","address":"1 Main St","panNumber":"ABCDE1234F","aadhaarNumber":"123412341234"}"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.phone").value("9000000000"))
            .andExpect(jsonPath("$.address").value("1 Main St"));
    }

    @Test
    void managerCannotChangePanNameOrAadhaar() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        String token = tokenFor(AssociateRole.MANAGER);

        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                .header("Authorization", "Bearer " + token).contentType("application/json")
                .content(PROFILE_JSON.formatted("ZZZZZ9999Z", "123412341234")))
            .andExpect(status().isForbidden());
        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                .header("Authorization", "Bearer " + token).contentType("application/json")
                .content("""
                    {"name":"Someone Else","phone":"9876543210","panNumber":"ABCDE1234F","aadhaarNumber":"123412341234"}"""))
            .andExpect(status().isForbidden());
        verify(associateRepository, never()).save(any());
    }

    @Test
    void managerCannotChangeAnyOtherIdentityField() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        String token = tokenFor(AssociateRole.MANAGER);
        String base = "\"name\":\"Jane Doe\",\"phone\":\"9876543210\",\"panNumber\":\"ABCDE1234F\",\"aadhaarNumber\":\"%s\"";
        String[] bodies = {
            "{" + base.formatted("999988887777") + "}",                                  // Aadhaar
            "{" + base.formatted("123412341234") + ",\"fatherHusbandName\":\"Dad\"}",   // father/husband
            "{" + base.formatted("123412341234") + ",\"dateOfBirth\":\"1990-01-01\"}",  // DOB
            "{" + base.formatted("123412341234") + ",\"gender\":\"MALE\"}",             // gender
            "{" + base.formatted("123412341234") + ",\"maritalStatus\":\"SINGLE\"}"     // marital status
        };
        for (String body : bodies) {
            mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                    .header("Authorization", "Bearer " + token).contentType("application/json").content(body))
                .andExpect(status().isForbidden());
        }
        verify(associateRepository, never()).save(any());
    }

    @Test
    void managerContactUpdateStoresStateDistrictAndPostalCode() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        when(associateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.MANAGER)).contentType("application/json")
                .content("""
                    {"name":"Jane Doe","phone":"9876543210","email":"j@x.com","state":"Delhi","district":"Central","postalCode":"110001","panNumber":"ABCDE1234F","aadhaarNumber":"123412341234"}"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value("j@x.com"))
            .andExpect(jsonPath("$.state").value("Delhi"))
            .andExpect(jsonPath("$.district").value("Central"))
            .andExpect(jsonPath("$.postalCode").value("110001"));
    }

    @Test
    void managerPhoneChangeToAnExistingNumberIsAConflict() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        when(associateRepository.existsByPhone("9000000000")).thenReturn(true);

        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/profile")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.MANAGER)).contentType("application/json")
                .content("""
                    {"name":"Jane Doe","phone":"9000000000","panNumber":"ABCDE1234F","aadhaarNumber":"123412341234"}"""))
            .andExpect(status().isConflict());
        verify(associateRepository, never()).save(any());
    }

    @Test
    void managerCanStillEditBankDetails() throws Exception {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seedAssociate()));
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        when(bankDetailsRepository.findByAssociateId(ASSOCIATE_ID)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/bank-details")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.MANAGER)).contentType("application/json")
                .content("""
                    {"bankName":"SBI","accountHolder":"Jane Doe","accountNumber":"123456","ifscCode":"SBIN0001234","accountType":"SAVINGS"}"""))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bankName").value("SBI"));
    }

    @Test
    void managerCannotEditNominee() throws Exception {
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/nominee")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.MANAGER))
                .contentType("application/json").content("{\"nomineeName\":\"X\",\"relation\":\"Son\"}"))
            .andExpect(status().isForbidden());
        verify(nomineeRepository, never()).save(any());
    }

    @Test
    void adminCanEditNominee() throws Exception {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(seedAssociate()));
        when(associateRepository.findByIdAndRole(ASSOCIATE_ID, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(seedAssociate()));
        when(nomineeRepository.findByAssociateId(ASSOCIATE_ID)).thenReturn(Optional.empty());

        mockMvc.perform(put("/api/admin/associates/" + ASSOCIATE_ID + "/nominee")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json").content("{\"nomineeName\":\"X\",\"relation\":\"Son\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.nomineeName").value("X"));
    }
}
