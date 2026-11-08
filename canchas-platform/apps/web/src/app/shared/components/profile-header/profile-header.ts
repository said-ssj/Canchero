import { Component, input, signal } from '@angular/core';

/** Shared identity frame; business and personal data remain in their own services. */
@Component({
  selector: 'app-profile-header',
  template: `
    <section class="profile-hero" aria-labelledby="profile-title">
      <div class="profile-cover" aria-hidden="true">
        @if (cover() && brokenCover() !== cover()) {
          <img [src]="cover()" alt="" (error)="brokenCover.set(cover())" />
        } @else {
          <span class="cover-circle"></span>
        }
      </div>
      <div class="profile-identity">
        <div class="identity-top" [class.no-avatar]="!showAvatar()">
          @if (showAvatar()) {
            <div class="profile-avatar">
              @if (photo() && brokenPhoto() !== photo()) {
                <img
                  [src]="photo()"
                  [alt]="'Foto de ' + name()"
                  (error)="brokenPhoto.set(photo())"
                />
              } @else {
                <span>{{ initials() || name().trim().slice(0, 1).toUpperCase() || 'C' }}</span>
              }
            </div>
          }
          <div class="profile-actions"><ng-content select="[profileActions]" /></div>
        </div>
        <div class="name-row">
          <h1 id="profile-title">{{ name() }}</h1>
          <span class="role-badge">{{ badge() }}</span>
        </div>
        <div class="profile-meta"><ng-content select="[profileMeta]" /></div>
        @if (description()) {
          <p class="profile-intro">{{ description() }}</p>
        }
        <ng-content select="[profileNotice]" />
      </div>
      <ng-content select="[profileTabs]" />
    </section>
  `,
  styleUrl: './profile-header.css',
})
export class ProfileHeader {
  readonly showAvatar = input(true);
  readonly name = input.required<string>();
  readonly badge = input('Jugador');
  readonly photo = input<string | null | undefined>(null);
  readonly cover = input<string | null | undefined>(null);
  readonly description = input('');
  readonly initials = input('');
  protected readonly brokenPhoto = signal<string | null | undefined>(null);
  protected readonly brokenCover = signal<string | null | undefined>(null);
}
