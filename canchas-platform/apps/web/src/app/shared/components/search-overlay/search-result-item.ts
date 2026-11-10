import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { CanchaResult, PersonaResult, SedeResult, highlightParts } from '@core/models/search.model';

@Component({
  selector: 'app-search-result-item',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div
      role="option"
      [id]="itemId"
      [attr.aria-selected]="isFocused"
      class="search-item"
      [class.focused]="isFocused"
      (click)="selected.emit()"
      tabindex="-1"
    >
      <!-- Icono / Avatar lateral -->
      <div class="item-visual">
        @if (type === 'sede') {
          @if (asSede(item).foto; as foto) {
            <img [src]="foto" alt="" class="venue-thumb" (error)="onImgError($event)" />
          } @else {
            <div class="icon-avatar sede-avatar">
              <span class="material-symbols-outlined">stadium</span>
            </div>
          }
        } @else if (type === 'cancha') {
          <div class="icon-avatar cancha-avatar">
            <span class="material-symbols-outlined">sports_soccer</span>
          </div>
        } @else if (type === 'persona') {
          @if (asPersona(item).foto; as foto) {
            <img [src]="foto" alt="" class="user-avatar-img" />
          } @else {
            <div class="user-avatar-initials">
              {{ initials(asPersona(item).nombre) }}
            </div>
          }
        }
      </div>

      <!-- Textos y detalles -->
      <div class="item-content">
        <div class="item-primary-line">
          <span class="item-title">
            @for (part of getTitleParts(); track $index) {
              @if (part.isMatch) {
                <mark class="search-highlight">{{ part.text }}</mark>
              } @else {
                <span>{{ part.text }}</span>
              }
            }
          </span>
          @if (type === 'sede' && asSede(item).rating; as rating) {
            <span class="sede-rating-chip">
              <span class="material-symbols-outlined icon-star">star</span>
              {{ rating | number: '1.1-1' }}
            </span>
          } @else if (type === 'persona') {
            <span class="role-chip">{{ asPersona(item).rol || 'Jugador' }}</span>
          }
        </div>

        <div class="item-secondary-line">
          @if (type === 'sede') {
            <span class="location-text">
              <span class="material-symbols-outlined icon-14">location_on</span>
              {{ asSede(item).distrito }}, {{ asSede(item).ciudad }}
            </span>
            @if (asSede(item).canchasCount; as count) {
              <span class="dot-sep">•</span>
              <span>{{ count }} {{ count === 1 ? 'cancha' : 'canchas' }}</span>
            }
          } @else if (type === 'cancha') {
            <span class="cancha-meta">
              {{ asCancha(item).formato }} • {{ asCancha(item).superficie }}
            </span>
            <span class="dot-sep">•</span>
            <span class="cancha-venue">
              <span class="material-symbols-outlined icon-14">business</span>
              {{ asCancha(item).venueNombre }} ({{ asCancha(item).distrito }})
            </span>
          } @else if (type === 'persona') {
            <span class="username-text">{{ asPersona(item).username }}</span>
          }
        </div>
      </div>

      <!-- Icono de flecha para indicar acción -->
      <div class="item-action-indicator" aria-hidden="true">
        <span class="material-symbols-outlined">arrow_forward</span>
      </div>
    </div>
  `,
  styles: [
    `
      .search-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 10px;
        cursor: pointer;
        transition:
          background-color 0.15s ease,
          transform 0.15s ease;
        user-select: none;
        margin-bottom: 2px;
      }
      .search-item:hover,
      .search-item.focused {
        background-color: var(--mat-sys-surface-container-high, #f1f5f9);
      }
      :host-context([data-theme='dark']) .search-item:hover,
      :host-context([data-theme='dark']) .search-item.focused {
        background-color: rgba(255, 255, 255, 0.08);
      }
      .item-visual {
        flex-shrink: 0;
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .venue-thumb {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        object-fit: cover;
      }
      .icon-avatar {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .sede-avatar {
        background: #e8f5e9;
        color: #15803d;
      }
      .cancha-avatar {
        background: #eff6ff;
        color: #2563eb;
      }
      :host-context([data-theme='dark']) .sede-avatar {
        background: rgba(21, 128, 61, 0.2);
        color: #4ade80;
      }
      :host-context([data-theme='dark']) .cancha-avatar {
        background: rgba(37, 99, 235, 0.2);
        color: #60a5fa;
      }
      .user-avatar-img {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
      }
      .user-avatar-initials {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #15803d;
        color: #ffffff;
        font-weight: 700;
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .item-content {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .item-primary-line {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .item-title {
        font-size: 0.93rem;
        font-weight: 600;
        color: var(--mat-sys-on-surface, #1e293b);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      :host-context([data-theme='dark']) .item-title {
        color: #f1f5f9;
      }
      .search-highlight {
        background-color: rgba(245, 158, 11, 0.25);
        color: inherit;
        font-weight: 700;
        border-radius: 2px;
        padding: 0 1px;
      }
      .sede-rating-chip {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-size: 0.75rem;
        font-weight: 700;
        color: #d97706;
      }
      .icon-star {
        font-size: 14px;
        width: 14px;
        height: 14px;
        font-variation-settings: 'FILL' 1;
      }
      .role-chip {
        font-size: 0.72rem;
        font-weight: 600;
        padding: 1px 6px;
        border-radius: 9999px;
        background: rgba(21, 128, 61, 0.1);
        color: #15803d;
      }
      :host-context([data-theme='dark']) .role-chip {
        background: rgba(74, 222, 128, 0.15);
        color: #4ade80;
      }
      .item-secondary-line {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8rem;
        color: var(--mat-sys-on-surface-variant, #64748b);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      :host-context([data-theme='dark']) .item-secondary-line {
        color: #94a3b8;
      }
      .location-text,
      .cancha-venue {
        display: inline-flex;
        align-items: center;
        gap: 2px;
      }
      .dot-sep {
        opacity: 0.5;
      }
      .username-text {
        font-family: monospace;
        font-size: 0.82rem;
        color: #15803d;
      }
      :host-context([data-theme='dark']) .username-text {
        color: #4ade80;
      }
      .icon-14 {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
      .item-action-indicator {
        color: #94a3b8;
        display: flex;
        align-items: center;
        opacity: 0;
        transition: opacity 0.15s ease;
      }
      .search-item:hover .item-action-indicator,
      .search-item.focused .item-action-indicator {
        opacity: 1;
      }
    `,
  ],
})
export class SearchResultItemComponent {
  @Input({ required: true }) type!: 'sede' | 'cancha' | 'persona';
  @Input({ required: true }) item!: SedeResult | CanchaResult | PersonaResult;
  @Input() query = '';
  @Input() isFocused = false;
  @Input() itemId = '';
  @Output() selected = new EventEmitter<void>();

  protected asSede(item: unknown): SedeResult {
    return item as SedeResult;
  }

  protected asCancha(item: unknown): CanchaResult {
    return item as CanchaResult;
  }

  protected asPersona(item: unknown): PersonaResult {
    return item as PersonaResult;
  }

  protected getTitleParts(): Array<{ text: string; isMatch: boolean }> {
    const raw =
      this.type === 'sede'
        ? (this.item as SedeResult).nombre
        : this.type === 'cancha'
          ? (this.item as CanchaResult).nombre
          : (this.item as PersonaResult).nombre;
    return highlightParts(raw, this.query);
  }

  protected onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.src = '/images/venue-placeholder.svg';
    }
  }

  protected initials(name: string | undefined): string {
    if (!name) return 'JU';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'JU';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
