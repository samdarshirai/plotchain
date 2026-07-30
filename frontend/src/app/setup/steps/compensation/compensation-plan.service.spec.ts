import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { CompensationPlanService } from './compensation-plan.service';
import { CompensationPlanRequest, CompensationPlanResponse, CompensationPlanSummary } from '../../models/compensation-plan.model';

describe('CompensationPlanService', () => {
  let service: CompensationPlanService;
  let httpMock: HttpTestingController;

  const response: CompensationPlanResponse = {
    versionLabel: 'v1.0',
    effectiveFrom: '2026-01-01',
    directIncomePct: 10,
    matchingIncomePct: 5,
    sponsorMatchingPct: 3,
    tdsPct: 10,
    adminChargeWithPanPct: 2,
    adminChargeWithoutPanPct: 3,
    activationFee: 500,
    minWithdrawal: 1000,
    settlementCycle: 'MONTHLY',
    royaltyBonusRates: [],
    rewardTiers: [],
    availableRanks: [],
    createdAt: '2026-01-01T00:00:00Z'
  };

  const summaries: CompensationPlanSummary[] = [
    {
      versionLabel: 'v1.0',
      effectiveFrom: '2026-01-01',
      createdAt: '2026-01-01T00:00:00Z'
    }
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [CompensationPlanService]
    });
    service = TestBed.inject(CompensationPlanService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches the current compensation plan', () => {
    let result: CompensationPlanResponse | undefined;
    service.getCurrent().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/compensation');
    expect(req.request.method).toBe('GET');
    req.flush(response);

    expect(result).toEqual(response);
  });

  it('fetches the compensation plan history', () => {
    let result: CompensationPlanSummary[] | undefined;
    service.getHistory().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/compensation/history');
    expect(req.request.method).toBe('GET');
    req.flush(summaries);

    expect(result).toEqual(summaries);
  });

  it('saves the compensation plan', () => {
    const request: CompensationPlanRequest = {
      effectiveFrom: response.effectiveFrom,
      directIncomePct: response.directIncomePct,
      matchingIncomePct: response.matchingIncomePct,
      sponsorMatchingPct: response.sponsorMatchingPct,
      tdsPct: response.tdsPct,
      adminChargeWithPanPct: response.adminChargeWithPanPct,
      adminChargeWithoutPanPct: response.adminChargeWithoutPanPct,
      activationFee: response.activationFee,
      minWithdrawal: response.minWithdrawal,
      settlementCycle: response.settlementCycle,
      rewardTiers: response.rewardTiers,
      royaltyBonusRates: []
    };
    let result: CompensationPlanResponse | undefined;
    service.update(request).subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/compensation');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual(request);
    req.flush(response);

    expect(result).toEqual(response);
  });
});
