import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';

export interface CommunityVenue {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  photo?: string;
  district?: string;
  city?: string;
  rating?: number;
}

export interface CommunityReview {
  venueId: string;
  venueName: string;
  author: string;
  rating: number;
  text: string;
  date: string;
  authorInitials?: string;
  reservedHere?: boolean;
  response?: string | null;
}

export interface CommunityPost {
  id: string;
  authorId: string;
  text: string;
  photos: string[];
  createdAt: string;
  badge?: string;
  likes?: number;
  liked?: boolean;
  commentCount?: number;
}

export interface CommunitySettings {
  biography: string;
  whatsapp: string;
  cover: string | null;
}

export interface CommunityProfile extends CommunitySettings {
  id: string;
  name: string;
  photo: string | null;
  role: string;
  handle?: string;
  followers: number;
  following: number;
  postCount: number;
  venues: CommunityVenue[];
  reviewCount: number;
  rating: number | null;
  reviews: CommunityReview[];
  phone?: string;
  address?: string;
  isPhonePublic?: boolean;
  isAddressPublic?: boolean;
  isFavoriteVenuePublic?: boolean;
  verified?: boolean;
  canchasCount?: number;
  ruc?: string;
  rucValidated?: boolean;
  matchesPlayed?: number;
  favoriteVenue?: string;
}

@Injectable({ providedIn: 'root' })
export class CommunityProfileService {
  private readonly http = inject(HttpClient);
  private readonly url = environment.apiUrl + '/community';

  profile(id: string) {
    return this.http.get<CommunityProfile>(this.url + '/profiles/' + encodeURIComponent(id));
  }
  posts(id: string, page = 0) {
    return this.http.get<{ items: CommunityPost[]; hasMore: boolean }>(
      this.url + '/profiles/' + encodeURIComponent(id) + '/posts',
      { params: { page } },
    );
  }
  publish(text: string, photos: string[]) {
    return this.http.post<CommunityPost>(this.url + '/posts', { text, photos });
  }
  removePost(id: string) {
    return this.http.delete<void>(this.url + '/posts/' + encodeURIComponent(id));
  }
  saveSettings(settings: CommunitySettings) {
    return this.http.put<CommunitySettings>(this.url + '/me/settings', settings);
  }
  relationship(id: string) {
    return this.http.get<{ following: boolean }>(
      this.url + '/profiles/' + encodeURIComponent(id) + '/relationship',
    );
  }
  follow(id: string, follow: boolean) {
    const url = this.url + '/profiles/' + encodeURIComponent(id) + '/follow';
    return follow ? this.http.put<void>(url, {}) : this.http.delete<void>(url);
  }
  owner(venueId: string) {
    return this.http.get<{ id: string; name: string; photo: string | null }>(
      this.url + '/venues/' + encodeURIComponent(venueId) + '/owner',
    );
  }
}
