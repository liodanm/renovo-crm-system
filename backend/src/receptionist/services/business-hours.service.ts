import { Injectable } from '@nestjs/common';

export interface BusinessHours {
  timezone: string;
  mon: { open: string; close: string } | null;
  tue: { open: string; close: string } | null;
  wed: { open: string; close: string } | null;
  thu: { open: string; close: string } | null;
  fri: { open: string; close: string } | null;
  sat: { open: string; close: string } | null;
  sun: { open: string; close: string } | null;
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

@Injectable()
export class BusinessHoursService {
  /**
   * Timezone-aware: a company's business hours are meaningless without a
   * timezone (an 8am-5pm rule evaluated in the server's UTC clock would be
   * wrong for literally every US company). Uses Intl.DateTimeFormat's
   * timeZone support rather than a date-math library dependency.
   */
  isOpenNow(hours: BusinessHours, now: Date = new Date()): boolean {
    const zoned = this.toZonedParts(now, hours.timezone);
    const dayKey = DAY_KEYS[zoned.weekday];
    const todayHours = hours[dayKey];
    if (!todayHours) return false; // closed all day (weekend, etc.)

    const nowMinutes = zoned.hour * 60 + zoned.minute;
    const openMinutes = this.parseTimeToMinutes(todayHours.open);
    const closeMinutes = this.parseTimeToMinutes(todayHours.close);
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }

  private parseTimeToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  private toZonedParts(date: Date, timeZone: string): { weekday: number; hour: number; minute: number } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const weekdayShort = parts.find((p) => p.type === 'weekday')!.value.toLowerCase().slice(0, 3);
    const hour = Number(parts.find((p) => p.type === 'hour')!.value) % 24;
    const minute = Number(parts.find((p) => p.type === 'minute')!.value);
    const weekday = DAY_KEYS.indexOf(weekdayShort as (typeof DAY_KEYS)[number]);
    return { weekday, hour, minute };
  }
}
