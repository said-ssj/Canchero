import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatRippleModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-admin-add-action',
  standalone: true,
  imports: [MatIconModule, MatRippleModule],
  templateUrl: './add-action.html',
  styleUrl: './add-action.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminAddAction {
  readonly label = input.required<string>();
  readonly description = input('');
  readonly icon = input('add');
  readonly activated = output<void>();
}
