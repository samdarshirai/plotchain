package com.plotchain.advanceloan;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.company.SettingsAuditService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AdvanceLoanService {
    private static final LocalDate MIN_DATE = LocalDate.of(1970, 1, 1);
    private static final LocalDate MAX_DATE = LocalDate.of(9999, 12, 31);

    private final AdvanceLoanRepository loans;
    private final LoanRepaymentRepository repayments;
    private final AssociateRepository associates;
    private final SettingsAuditService auditService;

    public AdvanceLoanService(AdvanceLoanRepository loans, LoanRepaymentRepository repayments,
                              AssociateRepository associates, SettingsAuditService auditService) {
        this.loans = loans;
        this.repayments = repayments;
        this.associates = associates;
        this.auditService = auditService;
    }

    @Transactional
    public AdvanceLoanResponse create(AdvanceLoanRequest r, UUID actorId) {
        requireTwoDecimals(r.amount());
        Associate a = associates.findById(r.associateId())
            .orElseThrow(() -> new AdvanceLoanException(HttpStatus.NOT_FOUND, "Associate not found: " + r.associateId()));
        BigDecimal previousDues = loans.sumAmountByAssociate(a.getId()).subtract(repayments.sumAmountByAssociate(a.getId()));
        AdvanceLoan l = new AdvanceLoan(UUID.randomUUID(), a.getId(), r.loanDate(), r.amount(), previousDues, r.payMode(),
            blankToNull(r.bankName()), blankToNull(r.instrumentNo()), blankToNull(r.remarks()));
        loans.save(l);
        auditService.record("ADVANCE_LOAN", "Advance loan " + r.amount() + " to " + a.getUserId(),
            Map.of("id", l.getId().toString(), "amount", r.amount().toPlainString()), actorId);
        return toResponse(l, a, BigDecimal.ZERO);
    }

    @Transactional(readOnly = true)
    public LoanDuesResponse dues(UUID associateId) {
        return new LoanDuesResponse(associateId,
            loans.sumAmountByAssociate(associateId).subtract(repayments.sumAmountByAssociate(associateId)));
    }

    // ponytail: associateId filter applied in memory over a date-bounded list.
    @Transactional(readOnly = true)
    public List<AdvanceLoanResponse> list(UUID associateId, LocalDate from, LocalDate to) {
        checkRange(from, to);
        List<AdvanceLoan> rows = loans.findInRange(from == null ? MIN_DATE : from, to == null ? MAX_DATE : to).stream()
            .filter(l -> associateId == null || associateId.equals(l.getAssociateId())).toList();
        Map<UUID, Associate> byId = associates.findAllById(rows.stream().map(AdvanceLoan::getAssociateId).distinct().toList())
            .stream().collect(Collectors.toMap(Associate::getId, x -> x));
        Map<UUID, BigDecimal> repaid = rows.isEmpty() ? Map.of()
            : repayments.sumsByLoanIds(rows.stream().map(AdvanceLoan::getId).toList()).stream()
                .collect(Collectors.toMap(o -> (UUID) o[0], o -> (BigDecimal) o[1]));
        return rows.stream().map(l -> toResponse(l, byId.get(l.getAssociateId()), repaid.getOrDefault(l.getId(), BigDecimal.ZERO))).toList();
    }

    @Transactional(readOnly = true)
    public AdvanceLoanDetailResponse detail(UUID id) {
        AdvanceLoan l = loans.findById(id)
            .orElseThrow(() -> new AdvanceLoanException(HttpStatus.NOT_FOUND, "Advance loan not found: " + id));
        Associate a = associates.findById(l.getAssociateId()).orElseThrow();
        List<LoanRepayment> rows = repayments.findByLoanIdOrderByPaymentDateDescCreatedAtDesc(id);
        BigDecimal repaid = rows.stream().map(LoanRepayment::getAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new AdvanceLoanDetailResponse(toResponse(l, a, repaid), a.getPhone(),
            rows.stream().map(p -> toResponse(p, a)).toList());
    }

    @Transactional
    public LoanRepaymentResponse repay(UUID loanId, RepaymentRequest r, UUID actorId) {
        requireTwoDecimals(r.amount());
        AdvanceLoan l = loans.findByIdForUpdate(loanId)
            .orElseThrow(() -> new AdvanceLoanException(HttpStatus.NOT_FOUND, "Advance loan not found: " + loanId));
        BigDecimal remaining = l.getAmount().subtract(repayments.sumAmountByLoan(loanId));
        if (r.amount().compareTo(remaining) > 0) {
            throw new AdvanceLoanException(HttpStatus.CONFLICT, "Repayment exceeds remaining balance of " + remaining.toPlainString());
        }
        Associate a = associates.findById(l.getAssociateId()).orElseThrow();
        String receiptNo = String.format("RCP-%06d", repayments.nextReceiptNumber());
        LoanRepayment p = new LoanRepayment(UUID.randomUUID(), loanId, receiptNo, r.paymentDate(), r.amount(), r.payMode(),
            blankToNull(r.bankName()), blankToNull(r.txnNo()));
        repayments.save(p);
        auditService.record("LOAN_REPAYMENT", "Repayment " + r.amount() + " receipt " + receiptNo,
            Map.of("id", p.getId().toString(), "loanId", loanId.toString(), "receiptNo", receiptNo), actorId);
        return toResponse(p, a);
    }

    @Transactional(readOnly = true)
    public List<LoanRepaymentResponse> repayments(LocalDate from, LocalDate to, String q) {
        checkRange(from, to);
        List<LoanRepayment> rows = repayments.search(from == null ? MIN_DATE : from, to == null ? MAX_DATE : to, likePattern(q));
        return rows.stream().map(this::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public LoanRepaymentResponse repayment(UUID id) {
        return toResponse(repayments.findById(id)
            .orElseThrow(() -> new AdvanceLoanException(HttpStatus.NOT_FOUND, "Repayment not found: " + id)));
    }

    private LoanRepaymentResponse toResponse(LoanRepayment p) {
        AdvanceLoan l = loans.findById(p.getLoanId()).orElseThrow();
        return toResponse(p, associates.findById(l.getAssociateId()).orElseThrow());
    }
    // ponytail: per-row lookups in the register; batch the loan/associate fetch if the register gets large.

    private static LoanRepaymentResponse toResponse(LoanRepayment p, Associate a) {
        return new LoanRepaymentResponse(p.getId(), p.getLoanId(), p.getReceiptNo(), p.getPaymentDate(), a.getId(),
            a.getUserId(), a.getName(), a.getPhone(), p.getAmount(), p.getPayMode(), p.getBankName(), p.getTxnNo());
    }

    private static AdvanceLoanResponse toResponse(AdvanceLoan l, Associate a, BigDecimal repaid) {
        return new AdvanceLoanResponse(l.getId(), a.getId(), a.getUserId(), a.getName(), l.getLoanDate(), l.getAmount(),
            l.getPreviousDues(), repaid, l.getAmount().subtract(repaid), l.getPayMode(), l.getBankName(),
            l.getInstrumentNo(), l.getRemarks());
    }

    static String likePattern(String q) {
        if (q == null || q.isBlank()) return "%";
        String escaped = q.trim().toLowerCase(java.util.Locale.ROOT).replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
        return "%" + escaped + "%";
    }

    private static void checkRange(LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) {
            throw new AdvanceLoanException(HttpStatus.BAD_REQUEST, "from must not be after to");
        }
    }

    private static void requireTwoDecimals(BigDecimal amount) {
        if (amount.stripTrailingZeros().scale() > 2) {
            throw new AdvanceLoanException(HttpStatus.BAD_REQUEST, "Amount must have at most 2 decimal places");
        }
    }

    private static String blankToNull(String s) { return s == null || s.isBlank() ? null : s.trim(); }
}
