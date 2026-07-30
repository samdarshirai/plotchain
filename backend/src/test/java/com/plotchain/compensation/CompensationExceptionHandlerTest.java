package com.plotchain.compensation;

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

// Standalone MockMvc against a throwaway controller, following the pattern ApiExceptionHandlerTest
// establishes: no Spring context, real HTTP/JSON/exception-mapping path.
class CompensationExceptionHandlerTest {

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestController())
            .setControllerAdvice(new CompensationExceptionHandler())
            .build();
    }

    @Test
    void rewardTierGapExceptionReturns409WithErrorMessage() throws Exception {
        String message = "Reward tier gap detected between 10% and 20%";
        mockMvc.perform(post("/test/reward-tier-gap"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value(message));
    }

    @RestController
    static class TestController {

        @PostMapping("/test/reward-tier-gap")
        public ResponseEntity<Void> rewardTierGap() {
            throw new RewardTierGapException("Reward tier gap detected between 10% and 20%");
        }
    }
}
