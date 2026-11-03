import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { AssociateDownlineComponent } from './associate-downline.component';
import { MyTeamService } from './my-team.service';
import { fitTable } from '../shared/utils/table-fit';

describe('AssociateDownlineComponent', () => {
  const row = (userId: string, extra = {}) => ({ id: userId, userId, name: 'Kid ' + userId, designation: null, kycStatus: 'VERIFIED', status: 'ACTIVE', joinedAt: '2026-01-01T00:00:00Z', sponsorUserId: 'VP1', position: 'L', phone: '9999999999', activatedAt: '2026-01-05T00:00:00Z', ...extra });
  let listFor: jasmine.Spy;

  function setup(scope: 'me' | 'admin', result: any) {
    listFor = jasmine.createSpy('listFor').and.returnValue(result);
    TestBed.configureTestingModule({
      imports: [AssociateDownlineComponent, TranslateModule.forRoot()],
      providers: [
        { provide: MyTeamService, useValue: { listFor } },
        { provide: ActivatedRoute, useValue: { snapshot: { data: { scope } } } }
      ]
    });
    const c = TestBed.createComponent(AssociateDownlineComponent);
    c.detectChanges();
    return c;
  }

  it('maps the nine columns, with dashes for missing mobile and activation date', () => {
    const c = setup('me', of({ associates: [row('VP2', { phone: null, activatedAt: null, position: 'R' })], page: 0, size: 20, totalElements: 1 }));
    expect(c.componentInstance.columns.length).toBe(9);
    expect(c.componentInstance.rows[0]).toEqual(jasmine.objectContaining({ serial: '1', userId: 'VP2', phone: '—', activatedAt: '—', position: 'Right' }));
    expect(c.componentInstance.rows[0]['joinedAt']).toMatch(/2026, \d{2}:\d{2}$/);
  });

  it('serial numbers continue across pages', () => {
    const c = setup('me', of({ associates: [row('VP22'), row('VP23')], page: 1, size: 20, totalElements: 22 }));
    expect(c.componentInstance.rows.map(r => r['serial'])).toEqual(['21', '22']);
  });

  it('search and leg are sent to the service; page resets to 0', () => {
    const c = setup('me', of({ associates: [], page: 0, size: 20, totalElements: 0 }));
    c.componentInstance.rootUserId = ' VP5 ';
    c.componentInstance.leg = 'R';
    c.componentInstance.loadPage(0);
    expect(listFor).toHaveBeenCalledWith('me', 'VP5', 'R', 0, 20);
  });

  it('admin scope is passed through', () => {
    setup('admin', of({ associates: [], page: 0, size: 20, totalElements: 0 }));
    expect(listFor).toHaveBeenCalledWith('admin', '', '', 0, 20);
  });

  it('404 shows not-found, other errors show load error', () => {
    const c = setup('me', throwError(() => ({ status: 404 })));
    expect(c.componentInstance.notFound).toBeTrue();
    expect(c.componentInstance.loadError).toBeFalse();
    listFor.and.returnValue(throwError(() => ({ status: 500 })));
    c.componentInstance.loadPage(0);
    expect(c.componentInstance.loadError).toBeTrue();
  });

  it('fits a 390px phone: nine columns stack, no sideways scroll', () => {
    const c = setup('me', of({ associates: [row('VP2'), row('VP3')], page: 0, size: 20, totalElements: 2 }));
    const host: HTMLElement = c.nativeElement;
    const box = document.createElement('div');
    box.style.cssText = 'width:390px;overflow:hidden;display:block';
    document.body.appendChild(box);
    box.appendChild(host);
    c.detectChanges();
    const table = host.querySelector('table') as HTMLTableElement;
    fitTable(table);
    // Pagination is left out: with no translations loaded here its buttons show raw keys.
    expect(table.classList).toContain('table--stacked');
    expect(table.scrollWidth).toBeLessThanOrEqual(table.clientWidth + 1);
    expect(table.offsetWidth).toBeLessThanOrEqual(box.clientWidth + 1);
    box.remove();
  });
});
