import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { TreeExplorerService } from './tree-explorer.service';
import { TreeNode } from '../models/tree-node.model';

const DEFAULT_DEPTH = 3;

@Component({
  selector: 'app-tree-explorer',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  template: `
    <div class="tree-explorer card">
      <h1 class="card-title">{{ 'admin.treeExplorer.title' | translate }}</h1>

      <div class="tree-explorer__search">
        <input
          type="text"
          [(ngModel)]="searchQuery"
          [placeholder]="'admin.treeExplorer.searchPlaceholder' | translate"
        />
        <button type="button" (click)="onSearch()">{{ 'admin.treeExplorer.searchAction' | translate }}</button>
      </div>

      <p *ngIf="notFound" class="tree-explorer__not-found">{{ 'admin.treeExplorer.notFound' | translate }}</p>
      <p *ngIf="loadError" class="tree-explorer__load-error">{{ 'admin.treeExplorer.loadError' | translate }}</p>

      <ng-container *ngIf="root">
        <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: root }"></ng-container>
      </ng-container>

      <ng-template #nodeTemplate let-node="node">
        <div class="tree-explorer__node">
          <span class="tree-explorer__node-id">{{ node.userId }}</span>
          <span class="tree-explorer__node-name">{{ node.name }}</span>
          <span class="tree-explorer__flag tree-explorer__flag--skewed" *ngIf="node.skewedLegsFlag">
            {{ 'admin.treeExplorer.skewedLegsFlag' | translate }}
          </span>
          <span class="tree-explorer__flag tree-explorer__flag--stagnant" *ngIf="node.stagnantFlag">
            {{ 'admin.treeExplorer.stagnantFlag' | translate }}
          </span>
          <div class="tree-explorer__children" *ngIf="node.children.length">
            <ng-container *ngFor="let child of node.children">
              <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: child }"></ng-container>
            </ng-container>
          </div>
        </div>
      </ng-template>
    </div>
  `
})
export class TreeExplorerComponent {
  private treeExplorerService = inject(TreeExplorerService);

  searchQuery = '';
  root: TreeNode | null = null;
  notFound = false;
  loadError = false;

  onSearch(): void {
    if (!this.searchQuery) return;
    this.notFound = false;
    this.loadError = false;
    this.treeExplorerService.search(this.searchQuery).subscribe({
      next: result => {
        const target = result.ancestorPath[result.ancestorPath.length - 1];
        this.treeExplorerService.subtree(target.id, DEFAULT_DEPTH).subscribe({
          next: node => (this.root = node),
          error: () => {
            this.root = null;
            this.loadError = true;
          }
        });
      },
      error: () => {
        this.root = null;
        this.notFound = true;
      }
    });
  }
}
