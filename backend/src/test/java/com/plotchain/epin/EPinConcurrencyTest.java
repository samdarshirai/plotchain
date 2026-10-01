package com.plotchain.epin;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotPendingException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

// Spec Testing section: simultaneous state transitions on the same pin(s) must serialise on the
// pessimistic row lock (EPinRepository.findByIdForUpdate / findAllocatable) and, for activation,
// on the conditional UPDATE in AssociateRepository.activateIfPending. Real H2 (MODE=PostgreSQL)
// datasource, committed data and real threads -- a mocked repository could not exercise row locks.
@SpringBootTest
@ActiveProfiles("test")
class EPinConcurrencyTest {

    @Autowired EPinService epinService;
    @Autowired EPinRepository epinRepository;
    @Autowired EPinEventRepository epinEventRepository;
    @Autowired AssociateRepository associateRepository;

    private final List<UUID> pinIds = new ArrayList<>();
    private final List<UUID> associateIds = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        for (UUID pinId : pinIds) {
            epinEventRepository.deleteAll(epinEventRepository.findByEpinIdOrderByAtAscIdAsc(pinId));
        }
        epinRepository.deleteAllById(pinIds);
        // children were seeded after their parent, so delete in reverse order
        for (int i = associateIds.size() - 1; i >= 0; i--) {
            associateRepository.deleteById(associateIds.get(i));
        }
    }

    private UUID seedAssociate(AssociateStatus status, UUID parentId, String position) {
        UUID id = UUID.randomUUID();
        Associate a = new Associate();
        a.setId(id);
        a.setPosition(position);
        a.setParentId(parentId);
        a.setName("Concurrency " + id);
        a.setKycStatus(KycStatus.VERIFIED);
        a.setJoinedAt(Instant.now());
        a.setCumulativeMatchedVolume(BigDecimal.ZERO);
        a.setUserId("conc-" + id);
        a.setEmail(id + "@test.local");
        a.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        // ADMIN: chk_associate_rank_required demands a rank only for ASSOCIATE rows.
        a.setRole(AssociateRole.ADMIN);
        a.setStatus(status);
        associateRepository.saveAndFlush(a);
        associateIds.add(id);
        return id;
    }

    private UUID seedPin(UUID batchId, EPinStatus status, UUID allocatedTo, UUID generatedBy) {
        EPin pin = new EPin();
        pin.setId(UUID.randomUUID());
        pin.setCode("c-" + UUID.randomUUID().toString().substring(0, 20)); // VARCHAR(24)
        pin.setBatchId(batchId);
        pin.setStatus(status);
        pin.setGeneratedBy(generatedBy);
        pin.setGeneratedAt(Instant.now());
        pin.setAllocatedTo(allocatedTo);
        epinRepository.saveAndFlush(pin);
        pinIds.add(pin.getId());
        return pin.getId();
    }

    // Releases all tasks at once and returns each outcome: the result, or the thrown exception.
    private List<Object> race(List<Callable<Object>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        CountDownLatch ready = new CountDownLatch(tasks.size());
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Object>> futures = new ArrayList<>();
        for (Callable<Object> task : tasks) {
            futures.add(pool.submit(() -> {
                ready.countDown();
                go.await();
                try {
                    return task.call();
                } catch (Exception e) {
                    return e;
                }
            }));
        }
        ready.await(5, TimeUnit.SECONDS);
        go.countDown();
        List<Object> outcomes = new ArrayList<>();
        for (Future<Object> f : futures) {
            outcomes.add(f.get(30, TimeUnit.SECONDS));
        }
        pool.shutdownNow();
        return outcomes;
    }

    private long failures(List<Object> outcomes, Class<? extends Exception> type) {
        return outcomes.stream().filter(type::isInstance).count();
    }

    private long successes(List<Object> outcomes) {
        return outcomes.stream().filter(o -> !(o instanceof Exception)).count();
    }

    private long eventCount(UUID pinId, EPinEventType type) {
        return epinEventRepository.findByEpinIdOrderByAtAscIdAsc(pinId).stream()
            .filter(e -> e.getEventType() == type).count();
    }

    @Test
    void concurrentAdminRedeemsOfOnePinYieldExactlyOneSuccess() throws Exception {
        UUID admin = seedAssociate(AssociateStatus.ACTIVE, null, "L");
        UUID target = seedAssociate(AssociateStatus.ACTIVE, null, "R");
        UUID pin = seedPin(UUID.randomUUID(), EPinStatus.UNUSED, null, admin);

        int n = 6;
        List<Callable<Object>> tasks = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            tasks.add(() -> epinService.redeem(pin, new RedeemEPinRequest(target, RedemptionType.TOPUP, null), admin));
        }
        List<Object> outcomes = race(tasks);

        assertThat(successes(outcomes)).isEqualTo(1);
        assertThat(failures(outcomes, EPinAlreadyRedeemedException.class)).isEqualTo(n - 1);
        assertThat(eventCount(pin, EPinEventType.REDEEMED)).isEqualTo(1);
        assertThat(epinRepository.findById(pin).orElseThrow().getStatus()).isEqualTo(EPinStatus.USED);
    }

    @Test
    void concurrentRedeemOwnOfOneHeldPinForTwoPendingMembersYieldsExactlyOneSuccess() throws Exception {
        UUID holder = seedAssociate(AssociateStatus.ACTIVE, null, "L");
        UUID m1 = seedAssociate(AssociateStatus.PENDING, holder, "L");
        UUID m2 = seedAssociate(AssociateStatus.PENDING, holder, "R");
        UUID pin = seedPin(UUID.randomUUID(), EPinStatus.ALLOCATED, holder, holder);
        String u1 = associateRepository.findById(m1).orElseThrow().getUserId();
        String u2 = associateRepository.findById(m2).orElseThrow().getUserId();

        List<Object> outcomes = race(List.of(
            () -> epinService.redeemOwn(pin, u1, holder),
            () -> epinService.redeemOwn(pin, u2, holder)));

        assertThat(successes(outcomes)).isEqualTo(1);
        assertThat(failures(outcomes, EPinAlreadyRedeemedException.class)).isEqualTo(1);
        long activated = List.of(m1, m2).stream()
            .filter(m -> associateRepository.findById(m).orElseThrow().getStatus() == AssociateStatus.ACTIVE).count();
        assertThat(activated).isEqualTo(1);
        assertThat(eventCount(pin, EPinEventType.REDEEMED)).isEqualTo(1);
    }

    @Test
    void concurrentTransfersOfOneHeldPinToTwoRecipientsYieldExactlyOneSuccess() throws Exception {
        UUID holder = seedAssociate(AssociateStatus.ACTIVE, null, "L");
        UUID r1 = seedAssociate(AssociateStatus.ACTIVE, null, "L");
        UUID r2 = seedAssociate(AssociateStatus.ACTIVE, null, "R");
        UUID pin = seedPin(UUID.randomUUID(), EPinStatus.ALLOCATED, holder, holder);
        String u1 = associateRepository.findById(r1).orElseThrow().getUserId();
        String u2 = associateRepository.findById(r2).orElseThrow().getUserId();

        List<Object> outcomes = race(List.of(
            () -> epinService.transfer(pin, u1, holder),
            () -> epinService.transfer(pin, u2, holder)));

        // The loser, once the winner commits, no longer holds the pin: not-owned.
        assertThat(successes(outcomes)).isEqualTo(1);
        assertThat(failures(outcomes, EPinNotOwnedException.class)).isEqualTo(1);
        EPinResponse winner = (EPinResponse) outcomes.stream().filter(o -> o instanceof EPinResponse).findFirst().orElseThrow();
        assertThat(epinRepository.findById(pin).orElseThrow().getAllocatedTo()).isEqualTo(winner.allocatedTo());
        assertThat(eventCount(pin, EPinEventType.TRANSFERRED)).isEqualTo(1);
    }

    @Test
    void concurrentAllocationsCompetingForTheLastPinsNeverDoubleAllocate() throws Exception {
        UUID admin = seedAssociate(AssociateStatus.ACTIVE, null, "L");
        UUID recipient = seedAssociate(AssociateStatus.ACTIVE, null, "R");
        UUID batch = UUID.randomUUID();
        for (int i = 0; i < 4; i++) {
            seedPin(batch, EPinStatus.UNUSED, null, admin);
        }

        List<Object> outcomes = race(List.of(
            () -> epinService.allocate(new AllocateEPinRequest(recipient, 3, batch), admin),
            () -> epinService.allocate(new AllocateEPinRequest(recipient, 3, batch), admin)));

        assertThat(successes(outcomes)).isEqualTo(1);
        assertThat(failures(outcomes, EPinInsufficientPoolException.class)).isEqualTo(1);
        long allocated = 0;
        for (UUID id : pinIds) {
            if (epinRepository.findById(id).orElseThrow().getStatus() == EPinStatus.ALLOCATED) {
                allocated++;
                assertThat(eventCount(id, EPinEventType.ALLOCATED)).isEqualTo(1);
            }
        }
        assertThat(allocated).isEqualTo(3);
    }

    @Test
    void twoPinsActivatingTheSamePendingAssociateConcurrentlyYieldExactlyOneSuccess() throws Exception {
        UUID admin = seedAssociate(AssociateStatus.ACTIVE, null, "L");
        UUID pending = seedAssociate(AssociateStatus.PENDING, null, "R");
        UUID pinA = seedPin(UUID.randomUUID(), EPinStatus.UNUSED, null, admin);
        UUID pinB = seedPin(UUID.randomUUID(), EPinStatus.UNUSED, null, admin);

        List<Object> outcomes = race(List.of(
            () -> epinService.redeem(pinA, new RedeemEPinRequest(pending, RedemptionType.ACTIVATION, null), admin),
            () -> epinService.redeem(pinB, new RedeemEPinRequest(pending, RedemptionType.ACTIVATION, null), admin)));

        assertThat(successes(outcomes)).isEqualTo(1);
        assertThat(failures(outcomes, AssociateNotPendingException.class)).isEqualTo(1);
        assertThat(associateRepository.findById(pending).orElseThrow().getStatus()).isEqualTo(AssociateStatus.ACTIVE);
        long used = List.of(pinA, pinB).stream()
            .filter(p -> epinRepository.findById(p).orElseThrow().getStatus() == EPinStatus.USED).count();
        assertThat(used).isEqualTo(1);
        // the losing pin's REDEEMED event was rolled back with its transaction
        assertThat(eventCount(pinA, EPinEventType.REDEEMED) + eventCount(pinB, EPinEventType.REDEEMED)).isEqualTo(1);
    }
}
