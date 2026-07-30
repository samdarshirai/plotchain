package com.plotchain.auth;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * Creates the very first ADMIN account on an otherwise empty database, from environment
 * configuration, so that no credentials need to be committed to the repository.
 *
 * Runs only when both properties are set AND no associate rows exist, so it is a no-op on
 * every subsequent boot. The provisioned admin must change its password on first login.
 */
@Component
public class AdminBootstrapRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrapRunner.class);

    private final AssociateRepository associateRepository;
    private final PasswordEncoder passwordEncoder;
    private final String adminUserId;
    private final String adminEmail;
    private final String adminPassword;

    public AdminBootstrapRunner(
        AssociateRepository associateRepository,
        PasswordEncoder passwordEncoder,
        @Value("${plotchain.bootstrap.admin-user-id:admin}") String adminUserId,
        @Value("${plotchain.bootstrap.admin-email:}") String adminEmail,
        @Value("${plotchain.bootstrap.admin-password:}") String adminPassword
    ) {
        this.associateRepository = associateRepository;
        this.passwordEncoder = passwordEncoder;
        this.adminUserId = adminUserId;
        this.adminEmail = adminEmail;
        this.adminPassword = adminPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (adminEmail == null || adminEmail.isBlank() || adminPassword == null || adminPassword.isBlank()) {
            return;
        }
        if (associateRepository.count() > 0) {
            return;
        }

        Associate admin = new Associate();
        admin.setId(UUID.randomUUID());
        admin.setUserId(adminUserId);
        admin.setName("Administrator");
        admin.setEmail(adminEmail);
        admin.setPasswordHash(passwordEncoder.encode(adminPassword));
        admin.setRole(AssociateRole.ADMIN);
        admin.setRankId(null);
        admin.setKycStatus(KycStatus.VERIFIED);
        admin.setJoinedAt(Instant.now());
        admin.setCumulativeMatchedVolume(BigDecimal.ZERO);
        admin.setMustChangePassword(true);
        associateRepository.save(admin);

        // Log the email only — never the password.
        log.info("Bootstrapped initial ADMIN account for {}. It must change its password on first login.", adminEmail);
    }
}
