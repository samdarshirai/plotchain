import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AdminService } from '../../../admin/admin.service';
import { AssociateSummary } from '../../../admin/models/associate-summary.model';
import { CycleSummary } from '../../../admin/models/cycle.model';
import { CycleManagementService } from '../../../admin/cycle-management/cycle-management.service';
import { AssociateLookupComponent } from '../associate-lookup/associate-lookup.component';
import { CycleSelectComponent } from '../cycle-select/cycle-select.component';

const CYCLE_LOOKUP_SIZE = 100;

// Admin filter pair for plot-booking screens: Associate Id lookup + Cycle (date-range shortcut).
// Drop inside `.add-plot-emi__filters`; the parent owns from/to/associateId.
@Component({
  selector: 'app-associate-cycle-filter',
  standalone: true,
  imports: [TranslateModule, AssociateLookupComponent, CycleSelectComponent],
  template: `
    <div class="add-plot-emi__field">{{ 'admin.viewPlotEmi.associate' | translate }}
      <app-associate-lookup [associates]="directory" [value]="associateId"
        [placeholder]="'admin.viewPlotEmi.anyAssociate' | translate"
        (selected)="associateChange.emit($event?.id ?? '')"></app-associate-lookup>
    </div>
    <app-cycle-select [cycles]="cycles" [from]="from" [to]="to" (rangeChange)="rangeChange.emit($event)"></app-cycle-select>
  `,
  styles: [`:host { display: contents; }`]
})
export class AssociateCycleFilterComponent implements OnInit {
  private adminService = inject(AdminService);
  private cycleService = inject(CycleManagementService);

  @Input() from = '';
  @Input() to = '';
  @Input() associateId = '';
  @Output() associateChange = new EventEmitter<string>();
  @Output() rangeChange = new EventEmitter<{ from: string; to: string }>();

  directory: AssociateSummary[] = [];
  cycles: CycleSummary[] = [];

  // Optional lookups: if they fail the list still works, just without them.
  ngOnInit(): void {
    this.adminService.listAssociates().subscribe({ next: d => (this.directory = d), error: () => undefined });
    this.cycleService.list('', 0, CYCLE_LOOKUP_SIZE).subscribe({ next: r => (this.cycles = r.cycles), error: () => undefined });
  }
}
