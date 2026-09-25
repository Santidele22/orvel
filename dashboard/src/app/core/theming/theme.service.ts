import { Injectable, signal, computed, effect } from '@angular/core';
import { DashboardThemeName, resolveThemeAlias } from './theme.tokens';
import { DashboardTemplateFactory } from '../templates/dashboard-template.factory';
import { DashboardThemeAliasScope } from './dashboard-theme-palettes.tokens';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private activeThemeSignal = signal<DashboardThemeName>('zen');
  private darkModeSignal = signal(false);

  readonly activeTheme = computed(() => this.activeThemeSignal());
  readonly isDarkModeEnabled = computed(() => this.darkModeSignal());

  readonly activeTemplate = computed(() => DashboardTemplateFactory.create(this.activeThemeSignal()));
  readonly activeThemeClass = computed(() => `theme-${this.activeThemeSignal()}`);

  constructor() {
  }

  setTheme(theme: DashboardThemeName): void {
    this.activeThemeSignal.set(theme);
  }

  setThemeFromAlias(scope: DashboardThemeAliasScope): void {
    this.setTheme(resolveThemeAlias(scope));
  }

  resolveThemeClass(scope: DashboardThemeAliasScope = 'default'): string {
    return `theme-${resolveThemeAlias(scope)}`;
  }

  isDarkMode(): boolean {
    return this.darkModeSignal();
  }

  toggleDarkMode(): void {
    this.darkModeSignal.update((isDark) => !isDark);
  }

}
