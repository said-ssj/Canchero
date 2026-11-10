import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CanchaResult, PersonaResult, SedeResult, highlightParts } from '@core/models/search.model';

@Component({
  selector: 'app-search-result-item',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatTooltipModule],
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
      <!-- Icono / Avatar lateral (40px) -->
      <div class="item-visual">
        @if (type === 'sede') {
          @if (hasValidPhoto(asSede(item).foto)) {
            <img [src]="asSede(item).foto" alt="" class="venue-thumb" (error)="onImgError()" />
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
            <img [src]="foto" alt="" class="user-avatar-img" (error)="onImgError()" />
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
            @if (asPersona(item).isCurrentUser) {
              <span class="current-user-chip">Tú</span>
            }
            <span class="role-badge" [class.role-dueno]="asPersona(item).rol === 'Dueño'">
              {{ asPersona(item).rol || 'Jugador' }}
            </span>
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
            <span
              class="cancha-venue"
              [matTooltip]="asCancha(item).venueNombre + ' (' + asCancha(item).distrito + ')'"
            >
              <span class="material-symbols-outlined icon-14">business</span>
              <span class="cancha-venue-text">
                {{ asCancha(item).venueNombre }} ({{ asCancha(item).distrito }})
              </span>
            </span>
          } @else if (type === 'persona') {
            <span class="username-text">{{ asPersona(item).username }}</span>
            @if (asPersona(item).sedePrincipal; as sede) {
              <span class="dot-sep">•</span>
              <span class="owner-venue-text">Complejo: {{ sede }}</span>
            }
          }
        </div>
      </div>

      <!-- Icono de flecha para indicar acción (visible por accesibilidad) -->
      <div class="item-action-indicator" aria-hidden="true">
        <span class="material-symbols-outlined">arrow_forward</span>
      </div>
    </div>
  `,
  styles: [
    `
      /* SIN EFECTO HOVER: Únicamente active/focused para navegación por teclado */
      .search-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 14px;
        border-radius: 10px;
        cursor: pointer;
        user-select: none;
        margin-bottom: 2px;
        background: transparent;
        outline: none;
      }
      .search-item.focused,
      .search-item:focus-visible {
        background-color: var(--mat-sys-surface-container-high, #f1f5f9) !important;
        outline: 2px solid #15803d;
        outline-offset: -2px;
      }
      :host-context([data-theme='dark']) .search-item.focused,
      :host-context([data-theme='dark']) .search-item:focus-visible {
        background-color: rgba(255, 255, 255, 0.08) !important;
        outline-color: #4ade80;
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
        background: #f1f5f9;
        color: #15803d;
      }
      .cancha-avatar {
        background: #eff6ff;
        color: #2563eb;
      }
      :host-context([data-theme='dark']) .sede-avatar {
        background: rgba(255, 255, 255, 0.08);
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
        flex-wrap: wrap;
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
      .current-user-chip {
        font-size: 0.72rem;
        font-weight: 700;
        padding: 1px 7px;
        border-radius: 9999px;
        background: #15803d;
        color: #ffffff;
      }
      .role-badge {
        font-size: 0.72rem;
        font-weight: 600;
        padding: 1px 7px;
        border-radius: 9999px;
        background: rgba(21, 128, 61, 0.1);
        color: #15803d;
      }
      .role-badge.role-dueno {
        background: rgba(217, 119, 6, 0.12);
        color: #d97706;
      }
      :host-context([data-theme='dark']) .role-badge {
        background: rgba(74, 222, 128, 0.15);
        color: #4ade80;
      }
      :host-context([data-theme='dark']) .role-badge.role-dueno {
        background: rgba(245, 158, 11, 0.2);
        color: #fbbf24;
      }
      .item-secondary-line {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8rem;
        color: var(--mat-sys-on-surface-variant, #64748b);
        flex-wrap: wrap;
      }
      :host-context([data-theme='dark']) .item-secondary-line {
        color: #94a3b8;
      }
      .location-text,
      .cancha-venue {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        min-width: 0;
      }
      .cancha-venue-text {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
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
      .owner-venue-text {
        font-size: 0.8rem;
        color: var(--mat-sys-on-surface-variant, #64748b);
      }
      .icon-14 {
        font-size: 14px;
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }
      .item-action-indicator {
        color: #94a3b8;
        display: flex;
        align-items: center;
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

  private imgHasFailed = false;

  protected asSede(item: unknown): SedeResult {
    return item as SedeResult;
  }

  protected asCancha(item: unknown): CanchaResult {
    return item as CanchaResult;
  }

  protected asPersona(item: unknown): PersonaResult {
    return item as PersonaResult;
  }

  protected hasValidPhoto(foto: string | undefined): boolean {
    if (this.imgHasFailed) return false;
    if (!foto) return false;
    const clean = foto.trim();
    if (!clean || clean.includes('venue-placeholder')) return false;
    return true;
  }

  protected onImgError(): void {
    this.imgHasFailed = true;
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

  protected initials(name: string | undefined): string {
    if (!name) return 'JU';
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'JU';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
}
