export type BusinessType = 'barber' | 'beauty' | 'wellness' | 'tattoo';

export interface DashboardMetric {
  id: string;
  label: string;
  value: string | number;
  suffix?: string;
  type: 'number' | 'currency' | 'percentage';
  icon: string;
  trend?: 'up' | 'down' | 'neutral';
  change?: number;
}

export interface NextClientData {
  name: string;
  service: string;
  time: string;
  period: string; // AM/PM
  status: string; // llega en breve, en sesión, etc.
  avatar: string;
  visits: number | string;
}

export interface DashboardState {
  businessType: BusinessType;
  mainKPI: DashboardMetric;
  secondaryMetrics: DashboardMetric[];
  nextClient: NextClientData;
  insight: string;
}
