export interface Business {
  id: string;
  name: string;
  owner_id: string;
  slug?: string;
  timezone?: string;
  created_at?: string;
  updated_at?: string;
}

export type WeekdayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export interface WorkingDayHours {
  enabled: boolean;
  start: string;
  end: string;
  intervals?: { start: string; end: string }[];
}

export interface BusinessSettings {
  businessName: string;
  bufferMinutes: number;
  minNoticeMinutes: number;
  slotIntervalMinutes: number;
  workingHours: Record<WeekdayKey, WorkingDayHours>;
  logoUrl?: string;
  coverUrl?: string;
  brandColor?: string;
  whatsapp?: string;
  instagram?: string;
  supportEmail?: string;
  businessType?: string;
  plan?: 'basic' | 'zen' | 'pro' | string;
  cancelationGracePeriod?: number;
  autoConfirm?: boolean;
  maxAdvanceDays?: number;
  allowMultipleServices?: boolean;
  cleanupTimeMinutes?: number;
  capacity?: number;
  weekStartDay?: 'monday' | 'sunday';
  timeFormat?: '12h' | '24h';
  firstName?: string;
  lastName?: string;
  phone?: string;
  slug?: string;
}

export interface BusinessPublicView {
  id: string;
  slug: string;
  displayName: string;
  timezone: string;
  settings: {
    bufferMinutes: number;
    minNoticeMinutes: number;
    slotIntervalMinutes: number;
    workingHours: Record<WeekdayKey, WorkingDayHours>;
  };
  bookingPolicy: {
    autoConfirm: boolean;
    cancellationWindowMinutes: number;
    allowClientProfessionalSelection: boolean;
  };
}
