package com.plotchain.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// Standalone MockMvc against a throwaway controller, following the pattern AuthControllerTest
// establishes: no Spring context, real HTTP/JSON/exception-mapping path, no mocking of
// concrete classes needed.
class ApiExceptionHandlerTest {

    MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(new TestController())
            .setControllerAdvice(new ApiExceptionHandler())
            .build();
    }

    @Test
    void fieldValidationFailureReportsEachField() throws Exception {
        mockMvc.perform(post("/test/validated")
                .contentType("application/json")
                .content("{\"name\":\"\",\"password\":\"\"}"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").isNotEmpty())
            .andExpect(jsonPath("$.fields.name").isNotEmpty())
            .andExpect(jsonPath("$.fields.password").isNotEmpty());
    }

    @Test
    void malformedJsonBodyReturns400WithAnErrorKey() throws Exception {
        mockMvc.perform(post("/test/validated")
                .contentType("application/json")
                .content("not json"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void wrongPathVariableTypeReturns400() throws Exception {
        mockMvc.perform(get("/test/not-a-uuid"))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").isNotEmpty());
    }

    @Test
    void dataIntegrityViolationReturns409WithoutLeakingConstraintDetails() throws Exception {
        mockMvc.perform(post("/test/conflict"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").isNotEmpty())
            .andExpect(jsonPath("$.error").value(not(containsStringIgnoringCase("idx_associate_user_id"))));
    }

    @RestController
    static class TestController {

        @PostMapping("/test/validated")
        public ResponseEntity<Void> validated(@Valid @RequestBody TestRequest request) {
            return ResponseEntity.ok().build();
        }

        @GetMapping("/test/{id}")
        public ResponseEntity<Void> byId(@PathVariable UUID id) {
            return ResponseEntity.ok().build();
        }

        @PostMapping("/test/conflict")
        public ResponseEntity<Void> conflict() {
            throw new DataIntegrityViolationException(
                "duplicate key value violates unique constraint \"idx_associate_user_id\"");
        }
    }

    record TestRequest(@NotBlank String name, @NotBlank String password) {}
}
