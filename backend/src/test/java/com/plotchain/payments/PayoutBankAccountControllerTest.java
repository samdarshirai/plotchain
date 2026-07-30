package com.plotchain.payments;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class PayoutBankAccountControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean PayoutBankAccountRepository payoutBankAccountRepository;

    private String tokenFor(AssociateRole role) {
        Associate token = new Associate();
        token.setId(UUID.randomUUID());
        token.setRole(role);
        return jwtService.generateToken(token);
    }

    @Test
    void getAccountReturnsTheStoredAccountForAnAdminToken() throws Exception {
        PayoutBankAccount stored = new PayoutBankAccount();
        stored.setBankName("HDFC Bank");
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(stored));

        mockMvc.perform(get("/api/company/payout-account")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.bankName").value("HDFC Bank"));
    }

    @Test
    void getAccountIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/company/payout-account")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }

    @Test
    void putAccountSavesAndReturnsTheUpdatedAccount() throws Exception {
        PayoutBankAccount stored = new PayoutBankAccount();
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(stored));
        when(payoutBankAccountRepository.save(any())).thenReturn(stored);

        mockMvc.perform(put("/api/company/payout-account")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"bankName\":\"HDFC Bank\",\"accountHolder\":\"Plotchain Estates Pvt Ltd\","
                    + "\"accountNumber\":\"50100123456789\",\"ifscCode\":\"HDFC0001234\",\"accountType\":\"CURRENT\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.ifscCode").value("HDFC0001234"));
    }

    @Test
    void putAccountReturnsFieldErrorForAMalformedIfscCode() throws Exception {
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(new PayoutBankAccount()));

        mockMvc.perform(put("/api/company/payout-account")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"bankName\":\"HDFC Bank\",\"accountHolder\":\"Plotchain Estates Pvt Ltd\","
                    + "\"accountNumber\":\"50100123456789\",\"ifscCode\":\"abc123\",\"accountType\":\"CURRENT\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("validation failed"))
            .andExpect(jsonPath("$.fields.ifscCode").isNotEmpty());
    }
}
