import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-search-result-group',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="search-group">
      <!-- Encabezado de la categoría -->
      <div class="group-header">
        <div class="group-title-wrap">
          <span class="material-symbols-outlined group-icon">{{ icon }}</span>
          <span class="group-title">{{ title }}</span>
        </div>
        <span class="group-badge">{{ count }}</span>
      </div>

      <!-- Contenido de los elementos -->
      <div class="group-items">
        <ng-content></ng-content>
      </div>

      <!-- Footer opcional de "Ver todos" -->
      @if (footerLabel) {
        <button type="button" class="group-footer-btn" (click)="footerClick.emit()">
          <span>{{ footerLabel }}</span>
          <span class="material-symbols-outlined">arrow_forward</span>
        </button>
      }
    </div>
  `,
  styles: [
    `
      .search-group {
        display: flex;
        flex-direction: column;
        margin-bottom: 16px;
      }
      .group-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 6px 10px;
        margin-bottom: 4px;
      }
      .group-title-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .group-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: #15803d;
      }
      :host-context([data-theme='dark']) .group-icon {
        color: #4ade80;
      }
      .group-title {
        font-size: 0.8rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--mat-sys-on-surface-variant, #64748b);
      }
      :host-context([data-theme='dark']) .group-title {
        color: #94a3b8;
      }
      .group-badge {
        font-size: 0.72rem;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 9999px;
        background: var(--mat-sys-surface-container, #e2e8f0);
        color: var(--mat-sys-on-surface-variant, #475569);
      }
      :host-context([data-theme='dark']) .group-badge {
        background: rgba(255, 255, 255, 0.1);
        color: #cbd5e1;
      }
      .group-items {
        display: flex;
        flex-direction: column;
      }
      .group-footer-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 14px;
        margin-top: 4px;
        border-radius: 8px;
        background: transparent;
        border: 1px dashed var(--mat-sys-outline-variant, #cbd5e1);
        color: #15803d;
        font-size: 0.84rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .group-footer-btn:hover {
        background: rgba(21, 128, 61, 0.06);
        border-color: #15803d;
      }
      :host-context([data-theme='dark']) .group-footer-btn {
        color: #4ade80;
        border-color: rgba(255, 255, 255, 0.15);
      }
      :host-context([data-theme='dark']) .group-footer-btn:hover {
        background: rgba(74, 222, 128, 0.1);
        border-color: #4ade80;
      }
      .group-footer-btn .material-symbols-outlined {
        font-size: 16px;
      }
    `,
  ],
})
export class SearchResultGroupComponent {
  @Input({ required: true }) title!: string;
  @Input({ required: true }) icon!: string;
  @Input({ required: true }) count!: number;
  @Input() footerLabel?: string;
  @Output() footerClick = new EventEmitter<void>();
}
