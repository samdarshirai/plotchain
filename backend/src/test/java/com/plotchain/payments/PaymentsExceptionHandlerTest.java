package com.plotchain.payments;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Standalone MockMvc against a throwaway controller, following CompensationExceptionHandlerTest's
// pattern: no Spring context, real HTTP/JSON/exception-mapping path.
class PaymentsExceptionHandlerTest {

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestController())
            .setControllerAdvice(new PaymentsExceptionHandler())
            .build();
    }

    @Test
    void invalidWithdrawalConfigExceptionReturns409WithErrorMessage() throws Exception {
        String message = "auto-approve limit must be a positive amount when approval mode is AUTO_UNDER_LIMIT";
        mockMvc.perform(post("/test/invalid-withdrawal-config"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value(message));
    }

    @RestController
    static class TestController {

        @PostMapping("/test/invalid-withdrawal-config")
        public ResponseEntity<Void> invalidWithdrawalConfig() {
            throw new InvalidWithdrawalConfigException(
                "auto-approve limit must be a positive amount when approval mode is AUTO_UNDER_LIMIT");
        }
    }
}
