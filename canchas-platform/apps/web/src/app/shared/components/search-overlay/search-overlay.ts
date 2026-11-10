import {
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { SearchService } from '@core/services/search.service';
import { RecentSearchesService } from '@core/services/recent-searches.service';
import { CanchaResult, PersonaResult, SearchResults, SedeResult } from '@core/models/search.model';
import { SEARCH_SHORTCUTS, SearchShortcut } from './search-shortcuts';
import { SearchResultItemComponent } from './search-result-item';
import { SearchResultGroupComponent } from './search-result-group';

export type SelectableItem =
  | { kind: 'sede'; data: SedeResult; id: string }
  | { kind: 'cancha'; data: CanchaResult; id: string }
  | { kind: 'persona'; data: PersonaResult; id: string }
  | { kind: 'recent'; term: string; id: string }
  | { kind: 'shortcut'; shortcut: SearchShortcut; id: string };

@Component({
  selector: 'app-search-overlay',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    SearchResultItemComponent,
    SearchResultGroupComponent,
  ],
  templateUrl: './search-overlay.html',
  styleUrl: './search-overlay.css',
})
export class SearchOverlayComponent implements OnInit, OnDestroy {
  private readonly searchService = inject(SearchService);
  private readonly recentSearchesService = inject(RecentSearchesService);
  private readonly router = inject(Router);

  @Input() isOpen = false;
  @Output() close = new EventEmitter<void>();

  @ViewChild('searchInput') searchInputRef?: ElementRef<HTMLInputElement>;

  protected query = signal('');
  protected isLoading = signal(false);
  protected hasError = signal(false);
  protected searchResults = signal<SearchResults | null>(null);
  protected activeIndex = signal(-1);

  protected readonly recentSearches = this.recentSearchesService.recentSearches;
  protected readonly shortcuts = SEARCH_SHORTCUTS;

  private readonly searchTerms$ = new Subject<string>();
  private searchSub?: Subscription;

  // Lista plana de elementos actualmente navegables con el teclado
  protected readonly selectableItems = computed<SelectableItem[]>(() => {
    const q = this.query().trim();
    if (q.length >= 2) {
      const res = this.searchResults();
      if (!res) return [];
      const list: SelectableItem[] = [];
      res.sedes.forEach((s, idx) => list.push({ kind: 'sede', data: s, id: `opt-sede-${idx}` }));
      res.canchas.forEach((c, idx) =>
        list.push({ kind: 'cancha', data: c, id: `opt-cancha-${idx}` }),
      );
      res.personas.forEach((p, idx) =>
        list.push({ kind: 'persona', data: p, id: `opt-persona-${idx}` }),
      );
      return list;
    }

    // Sin query: lista de recientes y luego atajos
    const list: SelectableItem[] = [];
    this.recentSearches().forEach((term, idx) =>
      list.push({ kind: 'recent', term, id: `opt-recent-${idx}` }),
    );
    this.shortcuts.forEach((sc, idx) =>
      list.push({ kind: 'shortcut', shortcut: sc, id: `opt-shortcut-${idx}` }),
    );
    return list;
  });

  protected readonly activeItemId = computed<string | null>(() => {
    const idx = this.activeIndex();
    const items = this.selectableItems();
    if (idx >= 0 && idx < items.length) {
      return items[idx].id;
    }
    return null;
  });

  protected readonly liveAnnouncement = computed<string>(() => {
    if (this.isLoading()) return 'Buscando sedes, canchas y personas...';
    if (this.hasError()) return 'Ocurrió un error al realizar la búsqueda.';
    const q = this.query().trim();
    if (q.length >= 2) {
      const res = this.searchResults();
      if (!res || res.totalCount === 0) {
        return `No se encontraron resultados para «${q}».`;
      }
      return `${res.totalCount} resultados encontrados para «${q}»: ${res.sedes.length} sedes, ${res.canchas.length} canchas, ${res.personas.length} personas.`;
    }
    return '';
  });

  ngOnInit(): void {
    this.searchSub = this.searchTerms$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((term) => {
          const clean = term.trim();
          if (clean.length < 2) {
            this.isLoading.set(false);
            this.hasError.set(false);
            this.searchResults.set(null);
            this.activeIndex.set(-1);
            return [];
          }
          this.isLoading.set(true);
          this.hasError.set(false);
          return this.searchService.search(clean);
        }),
      )
      .subscribe({
        next: (results) => {
          this.isLoading.set(false);
          this.searchResults.set(results);
          this.activeIndex.set(-1);
        },
        error: () => {
          this.isLoading.set(false);
          this.hasError.set(true);
          this.activeIndex.set(-1);
        },
      });
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.isOpen) {
      this.closeOverlay();
    }
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.query.set(value);
    this.searchTerms$.next(value);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const items = this.selectableItems();

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (items.length === 0) return;
      this.activeIndex.update((i) => (i < items.length - 1 ? i + 1 : 0));
      this.scrollToActiveItem();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length === 0) return;
      this.activeIndex.update((i) => (i > 0 ? i - 1 : items.length - 1));
      this.scrollToActiveItem();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const idx = this.activeIndex();
      if (idx >= 0 && idx < items.length) {
        this.selectItem(items[idx]);
      } else {
        // Si no hay ningún ítem activo seleccionado, buscar en /sedes con el texto ingresado
        this.submitGlobalSearch();
      }
    }
  }

  private scrollToActiveItem(): void {
    const activeId = this.activeItemId();
    if (!activeId) return;
    setTimeout(() => {
      const el = document.getElementById(activeId);
      el?.scrollIntoView({ block: 'nearest' });
    }, 10);
  }

  protected selectItem(item: SelectableItem): void {
    if (item.kind === 'sede') {
      this.selectSede(item.data);
    } else if (item.kind === 'cancha') {
      this.selectCancha(item.data);
    } else if (item.kind === 'persona') {
      this.selectPersona(item.data);
    } else if (item.kind === 'recent') {
      this.selectRecent(item.term);
    } else if (item.kind === 'shortcut') {
      this.selectShortcut(item.shortcut);
    }
  }

  protected selectSede(sede: SedeResult): void {
    this.recentSearchesService.add(sede.nombre);
    this.closeOverlay();
    void this.router.navigate(['/sedes', sede.id]);
  }

  protected selectCancha(cancha: CanchaResult): void {
    this.recentSearchesService.add(cancha.nombre);
    this.closeOverlay();
    void this.router.navigate(['/sedes', cancha.venueId]);
  }

  protected selectPersona(persona: PersonaResult): void {
    this.recentSearchesService.add(persona.nombre);
    this.closeOverlay();
    void this.router.navigate(['/perfiles', persona.id]);
  }

  protected selectRecent(term: string): void {
    this.query.set(term);
    this.searchTerms$.next(term);
    if (this.searchInputRef) {
      this.searchInputRef.nativeElement.value = term;
      this.searchInputRef.nativeElement.focus();
    }
  }

  protected removeRecent(term: string, event: MouseEvent): void {
    event.stopPropagation();
    this.recentSearchesService.remove(term);
  }

  protected clearAllRecent(): void {
    this.recentSearchesService.clear();
  }

  protected selectShortcut(shortcut: SearchShortcut): void {
    this.closeOverlay();
    if (shortcut.queryParams) {
      void this.router.navigate([shortcut.route], {
        queryParams: shortcut.queryParams,
      });
    } else {
      void this.router.navigate([shortcut.route]);
    }
  }

  protected submitGlobalSearch(): void {
    const q = this.query().trim();
    if (!q) {
      this.closeOverlay();
      void this.router.navigate(['/sedes']);
      return;
    }
    this.recentSearchesService.add(q);
    this.closeOverlay();
    void this.router.navigate(['/sedes'], { queryParams: { q } });
  }

  protected viewAllSedesForQuery(): void {
    this.submitGlobalSearch();
  }

  protected retrySearch(): void {
    const q = this.query().trim();
    if (q.length >= 2) {
      this.isLoading.set(true);
      this.hasError.set(false);
      this.searchTerms$.next(q);
    }
  }

  protected clearQuery(): void {
    this.query.set('');
    this.searchResults.set(null);
    this.hasError.set(false);
    this.activeIndex.set(-1);
    if (this.searchInputRef) {
      this.searchInputRef.nativeElement.value = '';
      this.searchInputRef.nativeElement.focus();
    }
  }

  protected closeOverlay(): void {
    this.close.emit();
  }

  protected isItemFocused(id: string): boolean {
    return this.activeItemId() === id;
  }
}
