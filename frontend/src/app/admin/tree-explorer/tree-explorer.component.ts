import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { InlineBannerComponent } from '../../shared/components/inline-banner/inline-banner.component';
import { TreeExplorerService } from './tree-explorer.service';
import { TreeNode } from '../models/tree-node.model';

const DEFAULT_DEPTH = 3;

@Component({
  selector: 'app-tree-explorer',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, InlineBannerComponent],
  template: `
    <div class="tree-explorer card">
      <div class="tree-explorer__intro">
        <h1 class="card-title">{{ 'admin.treeExplorer.title' | translate }}</h1>
        <p class="tree-explorer__subtitle">{{ 'admin.treeExplorer.subtitle' | translate }}</p>
      </div>

      <div class="tree-explorer__search">
        <span class="material-symbols-outlined">search</span>
        <input
          type="text"
          [(ngModel)]="searchQuery"
          [placeholder]="'admin.treeExplorer.searchPlaceholder' | translate"
          (keydown.enter)="onSearch()"
        />
        <button type="button" (click)="onSearch()">{{ 'admin.treeExplorer.searchAction' | translate }}</button>
      </div>

      <app-inline-banner *ngIf="notFound" tone="warning">{{ 'admin.treeExplorer.notFound' | translate }}</app-inline-banner>
      <app-inline-banner *ngIf="loadError" tone="danger">{{ 'admin.treeExplorer.loadError' | translate }}</app-inline-banner>

      <div class="tree-explorer__empty" *ngIf="!root && !notFound && !loadError">
        <span class="material-symbols-outlined">account_tree</span>
        <p class="tree-explorer__empty-title">{{ 'admin.treeExplorer.emptyStateTitle' | translate }}</p>
        <p class="tree-explorer__empty-body">{{ 'admin.treeExplorer.emptyStateBody' | translate }}</p>
      </div>

      <div class="tree-explorer__canvas" *ngIf="root">
        <div class="tree-explorer__canvas-inner">
          <span class="tree-explorer__result-eyebrow">{{ 'admin.treeExplorer.searchResultLabel' | translate }}</span>
          <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: root, depth: 0 }"></ng-container>
        </div>
      </div>

      <ng-template #nodeTemplate let-node="node" let-depth="depth">
        <div class="tree-explorer__level">
          <div
            class="tree-explorer__node"
            [class.tree-explorer__node--root]="depth === 0"
            [class.tree-explorer__node--left]="node.position === 'L'"
            [class.tree-explorer__node--right]="node.position === 'R'"
          >
            <span
              class="tree-explorer__position-badge"
              *ngIf="node.position as position"
              [class.tree-explorer__position-badge--left]="position === 'L'"
              [class.tree-explorer__position-badge--right]="position === 'R'"
            >
              {{ (position === 'L' ? 'admin.treeExplorer.positionLeftLabel' : 'admin.treeExplorer.positionRightLabel') | translate }}
            </span>

            <div class="tree-explorer__node-header">
              <span class="tree-explorer__node-avatar">{{ node.name.charAt(0) }}</span>
              <div class="tree-explorer__node-identity">
                <span class="tree-explorer__node-id">{{ node.userId }}</span>
                <span class="tree-explorer__node-name">{{ node.name }}</span>
              </div>
              <span
                class="tree-explorer__kyc-dot"
                [class.tree-explorer__kyc-dot--verified]="node.kycStatus === 'VERIFIED'"
                [class.tree-explorer__kyc-dot--pending]="node.kycStatus === 'PENDING'"
                [class.tree-explorer__kyc-dot--rejected]="node.kycStatus === 'REJECTED'"
                [title]="node.kycStatus"
              ></span>
            </div>

            <span class="tree-explorer__rank-chip">{{ node.rankName ?? ('admin.treeExplorer.noRankLabel' | translate) }}</span>

            <div class="tree-explorer__leg-bar" [class.tree-explorer__leg-bar--skewed]="node.skewedLegsFlag">
              <div class="tree-explorer__leg-bar-track">
                <span class="tree-explorer__leg-bar-segment tree-explorer__leg-bar-segment--left" [style.width.%]="legLeftPercent(node)"></span>
                <span class="tree-explorer__leg-bar-segment tree-explorer__leg-bar-segment--right" [style.width.%]="legRightPercent(node)"></span>
              </div>
              <div class="tree-explorer__leg-bar-values">
                <span>{{ 'admin.treeExplorer.leftLegLabel' | translate }}: ₹{{ node.leftLegVolume | number }}</span>
                <span>{{ 'admin.treeExplorer.rightLegLabel' | translate }}: ₹{{ node.rightLegVolume | number }}</span>
              </div>
            </div>

            <div class="tree-explorer__flags" *ngIf="node.skewedLegsFlag || node.stagnantFlag">
              <span class="tree-explorer__flag tree-explorer__flag--skewed" *ngIf="node.skewedLegsFlag">
                {{ 'admin.treeExplorer.skewedLegsFlag' | translate }}
              </span>
              <span class="tree-explorer__flag tree-explorer__flag--stagnant" *ngIf="node.stagnantFlag">
                {{ 'admin.treeExplorer.stagnantFlag' | translate }}
              </span>
            </div>
          </div>

          <div class="tree-explorer__children" *ngIf="depth < maxSlotDepth">
            <div class="tree-explorer__branch">
              <ng-container *ngIf="leftChild(node) as left; else vacantLeft">
                <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: left, depth: depth + 1 }"></ng-container>
              </ng-container>
              <ng-template #vacantLeft>
                <div class="tree-explorer__vacant-slot">
                  <span class="material-symbols-outlined">add</span>
                  <span>{{ 'admin.treeExplorer.vacantSlotLabel' | translate }}</span>
                </div>
              </ng-template>
            </div>
            <div class="tree-explorer__branch">
              <ng-container *ngIf="rightChild(node) as right; else vacantRight">
                <ng-container *ngTemplateOutlet="nodeTemplate; context: { node: right, depth: depth + 1 }"></ng-container>
              </ng-container>
              <ng-template #vacantRight>
                <div class="tree-explorer__vacant-slot">
                  <span class="material-symbols-outlined">add</span>
                  <span>{{ 'admin.treeExplorer.vacantSlotLabel' | translate }}</span>
                </div>
              </ng-template>
            </div>
          </div>
        </div>
      </ng-template>
    </div>
  `
})
export class TreeExplorerComponent {
  private treeExplorerService = inject(TreeExplorerService);

  readonly maxSlotDepth = DEFAULT_DEPTH;

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

  leftChild(node: TreeNode): TreeNode | undefined {
    return node.children.find(child => child.position === 'L');
  }

  rightChild(node: TreeNode): TreeNode | undefined {
    return node.children.find(child => child.position === 'R');
  }

  legLeftPercent(node: TreeNode): number {
    const total = node.leftLegVolume + node.rightLegVolume;
    return total === 0 ? 50 : (node.leftLegVolume / total) * 100;
  }

  legRightPercent(node: TreeNode): number {
    return 100 - this.legLeftPercent(node);
  }
}
