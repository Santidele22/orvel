import { DashboardThemeName } from '../theming/theme.tokens';
import { DashboardTemplate } from './dashboard-template.contract';
import { ZenTemplate } from './dashboard-templates';

export class DashboardTemplateFactory {
  private static readonly registry: Record<DashboardThemeName, new () => DashboardTemplate> = {
    zen: ZenTemplate
  };

  static create(name: DashboardThemeName): DashboardTemplate {
    const TemplateClass = this.registry[name] || ZenTemplate;
    return new TemplateClass();
  }
}
