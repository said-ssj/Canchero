import { Component } from '@angular/core';
import { AdminLayout } from './layout/admin-layout';

@Component({
  standalone: true,
  selector: 'app-admin',
  imports: [AdminLayout],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin {}

export { AdminLayout };
