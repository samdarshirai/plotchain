package com.plotchain.booking;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

// MockMvc never performs the servlet ERROR dispatch, so it can't see sendError(400) being turned
// into 401 by the security chain (which logged associates out). A real server can.
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class ErrorDispatchStatusTest {

    @Autowired TestRestTemplate rest;
    @Autowired JwtService jwtService;
    @MockBean AssociateRepository associateRepository;
    @MockBean BookingService bookingService;

    @Test
    void invertedRangeIs400NotUnauthorized() {
        UUID id = UUID.randomUUID();
        Associate a = new Associate();
        a.setId(id);
        a.setRole(AssociateRole.ASSOCIATE);
        when(associateRepository.findById(id)).thenReturn(Optional.of(a));
        HttpHeaders h = new HttpHeaders();
        h.setBearerAuth(jwtService.generateToken(a));

        var res = rest.exchange("/api/associates/me/team-bookings?from=2026-11-24&to=2026-11-23",
            HttpMethod.GET, new HttpEntity<>(h), String.class);

        assertEquals(HttpStatus.BAD_REQUEST, res.getStatusCode());
    }
}
