import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { RewardsService } from './rewards.service';
import { AssociateRankProgress } from './models/associate-rank-progress.model';

describe('RewardsService', () => {
  let service: RewardsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [RewardsService]
    });
    service = TestBed.inject(RewardsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the caller\'s own rank progress with no query params', () => {
    const mockResponse: AssociateRankProgress = {
      currentRank: 'Sales Associate', currentRankOrder: 1, nextRank: 'Sales Executive',
      progressPercent: 40, cumulativeMatchedVolume: 4000, volumeToNextRank: 6000, rewardTiers: []
    };

    service.getMyRankProgress().subscribe(res => {
      expect(res).toEqual(mockResponse);
    });

    const req = httpMock.expectOne('/api/associates/me/rank-progress');
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
