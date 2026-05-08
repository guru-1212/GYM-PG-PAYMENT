import { Component, inject } from '@angular/core';
import { LoadingService } from '../core/services/loading.service';

@Component({
  selector: 'app-page-loader',
  standalone: true,
  templateUrl: './page-loader.component.html',
  styleUrl: './page-loader.component.scss',
})
export class PageLoaderComponent {
  private readonly loadingService = inject(LoadingService);
  
  readonly isLoading = this.loadingService.isLoading;
}
