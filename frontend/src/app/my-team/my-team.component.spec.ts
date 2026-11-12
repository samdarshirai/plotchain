import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { MyTeamComponent } from './my-team.component';
import { MyTeamService } from './my-team.service';

describe('MyTeamComponent', () => {
  const row = { id: '1', userId: 'VP2', name: 'Kid', designation: null, kycStatus: 'VERIFIED', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', sponsorUserId: 'VP00000', position: 'L' };
  let list: jasmine.Spy;

  beforeEach(() => {
    list = jasmine.createSpy('list').and.returnValue(of({ associates: [row], page: 0, size: 20, totalElements: 1 }));
    TestBed.configureTestingModule({
      imports: [MyTeamComponent, TranslateModule.forRoot()],
      providers: [{ provide: MyTeamService, useValue: { list } }]
    });
  });

  it('loads rows and counts', () => {
    const c = TestBed.createComponent(MyTeamComponent);
    c.detectChanges();
    expect(c.componentInstance.rows[0]['userId']).toBe('VP2');
    expect(c.componentInstance.viewTabs[0].count).toBe(1);
  });

  it('marks plot buyers with an icon after the name', () => {
    list.and.returnValue(of({ associates: [{ ...row, plotBuyer: true }, { ...row, userId: 'VP3', plotBuyer: false }], page: 0, size: 20, totalElements: 2 }));
    const c = TestBed.createComponent(MyTeamComponent);
    c.detectChanges();
    expect(c.componentInstance.rows[0]['name']).toBe('Kid 🏞️');
    expect(c.componentInstance.rows[1]['name']).toBe('Kid');
  });

  it('green view filters kycStatus VERIFIED', () => {
    const c = TestBed.createComponent(MyTeamComponent);
    c.detectChanges();
    c.componentInstance.onViewChange('green');
    expect(list).toHaveBeenCalledWith({ kycStatus: 'VERIFIED' }, 0, 100);
  });

  it('left/right views filter by leg', () => {
    const c = TestBed.createComponent(MyTeamComponent);
    c.detectChanges();
    c.componentInstance.onViewChange('left');
    expect(list).toHaveBeenCalledWith({ leg: 'L' }, 0, 100);
    c.componentInstance.onViewChange('right');
    expect(list).toHaveBeenCalledWith({ leg: 'R' }, 0, 100);
  });

  it('sponsored view filters to directly sponsored associates', () => {
    const c = TestBed.createComponent(MyTeamComponent);
    c.detectChanges();
    c.componentInstance.onViewChange('sponsored');
    expect(list).toHaveBeenCalledWith({ sponsoredOnly: 'true' }, 0, 100);
  });
});
