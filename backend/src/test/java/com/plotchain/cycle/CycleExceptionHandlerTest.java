package com.plotchain.cycle;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CycleExceptionHandlerTest {

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestController())
            .setControllerAdvice(new CycleExceptionHandler())
            .build();
    }

    @Test
    void cycleNotFoundExceptionReturns404WithErrorMessage() throws Exception {
        mockMvc.perform(post("/test/cycle-not-found"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void cycleAlreadyClosedExceptionReturns409WithErrorMessage() throws Exception {
        mockMvc.perform(post("/test/cycle-already-closed"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").exists());
    }

    @RestController
    static class TestController {

        @PostMapping("/test/cycle-not-found")
        public ResponseEntity<Void> cycleNotFound() {
            throw new CycleNotFoundException(UUID.randomUUID());
        }

        @PostMapping("/test/cycle-already-closed")
        public ResponseEntity<Void> cycleAlreadyClosed() {
            throw new CycleAlreadyClosedException(UUID.randomUUID());
        }
    }
}
