package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @MockBean on the repository INTERFACES (not AssociateBankDetailsService), so this runs a real
// AssociateBankDetailsService inside a real Spring Security filter chain -- same pattern as
// AssociateProfileControllerTest.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateBankDetailsControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean AssociateBankDetailsRepository associateBankDetailsRepository;

    private Associate seeded(UUID id) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId("VP00001");
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        return a;
    }

    private String tokenFor(Associate associate) {
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    private String requestJson(String bankName, String accountHolder, String accountNumber,
                                String ifscCode, String accountType) throws Exception {
        return new ObjectMapper().writeValueAsString(
            new UpdateAssociateBankDetailsRequest(bankName, accountHolder, accountNumber, ifscCode, accountType));
    }

    @Test
    void getReturnsEmptyFieldsWhenNoBankDetailsSavedYet() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);
        when(associateBankDetailsRepository.findByAssociateId(self.getId())).thenReturn(Optional.empty());

        mockMvc.perform(get("/api/associates/me/bank-details")
                .header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bankName").doesNotExist());
    }

    @Test
    void getReturns401WithoutAToken() throws Exception {
        mockMvc.perform(get("/api/associates/me/bank-details"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void putSavesBankDetails() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);
        when(associateBankDetailsRepository.findByAssociateId(self.getId())).thenReturn(Optional.empty());
        when(associateBankDetailsRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        mockMvc.perform(put("/api/associates/me/bank-details")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content(requestJson("State Bank", "Jane Doe", "123456789012", "SBIN0001234", "SAVINGS")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bankName").value("State Bank"))
            .andExpect(jsonPath("$.accountNumber").value("123456789012"))
            .andExpect(jsonPath("$.ifscCode").value("SBIN0001234"));
    }

    @Test
    void putRejectsAMalformedIfscCode() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);

        mockMvc.perform(put("/api/associates/me/bank-details")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content(requestJson("State Bank", "Jane Doe", "123456789012", "not-an-ifsc", "SAVINGS")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void putRejectsABlankBankName() throws Exception {
        Associate self = seeded(UUID.randomUUID());
        String token = tokenFor(self);

        mockMvc.perform(put("/api/associates/me/bank-details")
                .header("Authorization", "Bearer " + token)
                .contentType("application/json")
                .content(requestJson("  ", "Jane Doe", "123456789012", "SBIN0001234", "SAVINGS")))
            .andExpect(status().isBadRequest());
    }

    @Test
    void putReturns401WithoutAToken() throws Exception {
        mockMvc.perform(put("/api/associates/me/bank-details")
                .contentType("application/json")
                .content(requestJson("State Bank", "Jane Doe", "123456789012", "SBIN0001234", "SAVINGS")))
            .andExpect(status().isUnauthorized());
    }
}
