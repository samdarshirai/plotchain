import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AdminRecentSalesTableComponent } from './recent-sales-table.component';
import { Sale } from '../../../admin/models/sale.model';

@Component({
  standalone: true,
  imports: [AdminRecentSalesTableComponent],
  template: `<app-admin-recent-sales-table [sales]="sales"></app-admin-recent-sales-table>`
})
class HostComponent {
  sales: Sale[] = [];
}

describe('AdminRecentSalesTableComponent', () => {
  let hostFixture: ComponentFixture<HostComponent>;

  const sale: Sale = {
    id: 's1', plotId: 'p1', associateId: 'a1', buyerName: 'Jane Buyer', buyerPhone: '9999999999',
    buyerEmail: null, amount: 840000, cycleId: 'c1', legCredited: 'L', status: 'RECORDED',
    voidReason: null, recordedAt: '2026-08-18T00:00:00Z', plotNo: 'VG2-118', projectName: 'Viraj Greens Ph II',
    associateUserId: 'VP00001', associateName: 'Jane Associate'
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminRecentSalesTableComponent, HostComponent, TranslateModule.forRoot()]
    }).compileComponents();
    hostFixture = TestBed.createComponent(HostComponent);
  });

  it('renders plot, project, associate, value, date and status for each sale', () => {
    hostFixture.componentInstance.sales = [sale];
    hostFixture.detectChanges();

    const text = hostFixture.nativeElement.textContent;
    expect(text).toContain('VG2-118');
    expect(text).toContain('Viraj Greens Ph II');
    expect(text).toContain('Jane Associate');
    const cells: NodeListOf<HTMLElement> = hostFixture.nativeElement.querySelectorAll('td');
    expect(cells[3].textContent).toContain('840,000');
    expect(cells[4].textContent).toContain('Aug');
    const statusPill: HTMLElement = hostFixture.nativeElement.querySelector('.admin-recent-sales-table__status-pill');
    expect(statusPill.classList).not.toContain('admin-recent-sales-table__status-pill--voided');
  });

  it('marks a VOIDED sale with the voided pill class', () => {
    hostFixture.componentInstance.sales = [{ ...sale, status: 'VOIDED' }];
    hostFixture.detectChanges();

    const statusPill: HTMLElement = hostFixture.nativeElement.querySelector('.admin-recent-sales-table__status-pill');
    expect(statusPill.classList).toContain('admin-recent-sales-table__status-pill--voided');
  });

  it('shows an empty state when there are no sales', () => {
    hostFixture.detectChanges();

    expect(hostFixture.nativeElement.querySelector('.admin-recent-sales-table__empty')).toBeTruthy();
    expect(hostFixture.nativeElement.querySelector('table')).toBeFalsy();
  });
});
