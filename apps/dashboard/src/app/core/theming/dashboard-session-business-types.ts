import {
  SelectedBusinessType,
  sanitizeSelectedBusinessTypes
} from '../auth/mock-login-business-types';

export type DashboardFromSessionConfig = {
  dashboards: Array<{
    businessType: SelectedBusinessType;
    theme: SelectedBusinessType;
  }>;
};

const DEFAULT_BUSINESS_TYPE: SelectedBusinessType = 'zen';

function readSelectedBusinessTypesFromSession(session: unknown): SelectedBusinessType[] {
  if (!session || typeof session !== 'object') {
    return [];
  }

  const rawSelectedBusinessTypes = (session as { selectedBusinessTypes?: unknown }).selectedBusinessTypes;
  return sanitizeSelectedBusinessTypes(rawSelectedBusinessTypes);
}

export function resolveDashboardConfigFromSession(session: unknown): DashboardFromSessionConfig {
  const selectedBusinessTypes = readSelectedBusinessTypesFromSession(session);

  if (selectedBusinessTypes.length <= 1) {
    const businessType = selectedBusinessTypes[0] ?? DEFAULT_BUSINESS_TYPE;

    return {
      dashboards: [{ businessType, theme: businessType }]
    };
  }

  return {
    dashboards: selectedBusinessTypes.map((businessType) => ({
      businessType,
      theme: businessType
    }))
  };
}
