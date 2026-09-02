package com.plotchain.associate;

import com.plotchain.auth.JwtService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class AssociateControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        // Configure the mock to return this ACTIVE associate when queried during filter authentication
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    @Test
    void listReturnsAssociatesOrderedByUserId() throws Exception {
        Associate first = new Associate();
        first.setId(UUID.randomUUID());
        first.setUserId("VP00001");
        first.setName("Root Left");
        when(associateRepository.findAllByOrderByUserIdAsc()).thenReturn(List.of(first));

        mockMvc.perform(get("/api/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].id").value(first.getId().toString()))
            .andExpect(jsonPath("$[0].userId").value("VP00001"))
            .andExpect(jsonPath("$[0].name").value("Root Left"));
    }

    @Test
    void listFlagsHasFreeSlotByHowManyLegsAreOccupied() throws Exception {
        Associate oneLegFree = new Associate();
        oneLegFree.setId(UUID.randomUUID());
        oneLegFree.setUserId("VP00001");
        oneLegFree.setName("Root");

        Associate childOfOneLegFree = new Associate();
        childOfOneLegFree.setId(UUID.randomUUID());
        childOfOneLegFree.setUserId("VP00002");
        childOfOneLegFree.setName("Left Child");
        childOfOneLegFree.setParentId(oneLegFree.getId());
        childOfOneLegFree.setPosition("L");

        Associate bothLegsFull = new Associate();
        bothLegsFull.setId(UUID.randomUUID());
        bothLegsFull.setUserId("VP00003");
        bothLegsFull.setName("Fully Placed");

        Associate leftOfFull = new Associate();
        leftOfFull.setId(UUID.randomUUID());
        leftOfFull.setUserId("VP00004");
        leftOfFull.setName("Full's Left");
        leftOfFull.setParentId(bothLegsFull.getId());
        leftOfFull.setPosition("L");

        Associate rightOfFull = new Associate();
        rightOfFull.setId(UUID.randomUUID());
        rightOfFull.setUserId("VP00005");
        rightOfFull.setName("Full's Right");
        rightOfFull.setParentId(bothLegsFull.getId());
        rightOfFull.setPosition("R");

        when(associateRepository.findAllByOrderByUserIdAsc())
            .thenReturn(List.of(oneLegFree, childOfOneLegFree, bothLegsFull, leftOfFull, rightOfFull));

        mockMvc.perform(get("/api/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].hasFreeSlot").value(true))
            .andExpect(jsonPath("$[1].hasFreeSlot").value(true))
            .andExpect(jsonPath("$[2].hasFreeSlot").value(false))
            .andExpect(jsonPath("$[3].hasFreeSlot").value(true))
            .andExpect(jsonPath("$[4].hasFreeSlot").value(true));
    }

    @Test
    void listIsForbiddenForAnAssociateToken() throws Exception {
        mockMvc.perform(get("/api/associates")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE)))
            .andExpect(status().isForbidden());
    }
}
