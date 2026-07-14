import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';

export interface WeatherSnapshot {
  location: { latitude: number; longitude: number };
  current: {
    temperatureF: number;
    windSpeedMph: number;
    precipitationInches: number;
    condition: string;
    conditionCode: number;
    isDay: boolean;
  };
  daily: Array<{
    date: string;
    highF: number;
    lowF: number;
    precipitationProbabilityPct: number;
    condition: string;
  }>;
  /** True if a crew is likely to have to reschedule (rain, high wind, or storms in the next 24h). */
  workAdvisory: { isRisky: boolean; reason: string | null };
}

const CACHE_TTL_SECONDS = 30 * 60; // weather doesn't need to be fresher than 30 min for a dashboard widget

/**
 * Open-Meteo (open-meteo.com) requires no API key and has a generous free
 * tier (10,000 requests/day), which is why it's the right choice here over
 * a keyed provider like OpenWeatherMap for a widget that isn't the core
 * product — no secret to provision, no billing surface for something
 * this peripheral.
 */
@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(@Inject('REDIS_CLIENT') private readonly redis: Redis) {}

  async getForecast(latitude: number, longitude: number): Promise<WeatherSnapshot | null> {
    const cacheKey = `weather:${latitude.toFixed(2)}:${longitude.toFixed(2)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    try {
      const url = new URL('https://api.open-meteo.com/v1/forecast');
      url.searchParams.set('latitude', latitude.toString());
      url.searchParams.set('longitude', longitude.toString());
      url.searchParams.set('current', 'temperature_2m,wind_speed_10m,precipitation,weather_code,is_day');
      url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code');
      url.searchParams.set('temperature_unit', 'fahrenheit');
      url.searchParams.set('wind_speed_unit', 'mph');
      url.searchParams.set('precipitation_unit', 'inch');
      url.searchParams.set('timezone', 'auto');
      url.searchParams.set('forecast_days', '5');

      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
      if (!response.ok) {
        this.logger.warn(`Open-Meteo returned ${response.status}`);
        return null;
      }

      const data = await response.json();
      const snapshot = this.mapResponse(latitude, longitude, data);

      await this.redis.set(cacheKey, JSON.stringify(snapshot), 'EX', CACHE_TTL_SECONDS);
      return snapshot;
    } catch (err) {
      // A down weather provider should never break the dashboard — the
      // widget renders an "unavailable" state and everything else loads.
      this.logger.error('Failed to fetch weather forecast', err as Error);
      return null;
    }
  }

  private mapResponse(latitude: number, longitude: number, data: any): WeatherSnapshot {
    const currentCode = data.current.weather_code as number;
    const daily = (data.daily.time as string[]).map((date, i) => ({
      date,
      highF: Math.round(data.daily.temperature_2m_max[i]),
      lowF: Math.round(data.daily.temperature_2m_min[i]),
      precipitationProbabilityPct: data.daily.precipitation_probability_max[i] ?? 0,
      condition: this.describeWeatherCode(data.daily.weather_code[i]),
    }));

    const tomorrow = daily[1];
    const risky = tomorrow && (tomorrow.precipitationProbabilityPct >= 60 || tomorrow.condition === 'Thunderstorm');

    return {
      location: { latitude, longitude },
      current: {
        temperatureF: Math.round(data.current.temperature_2m),
        windSpeedMph: Math.round(data.current.wind_speed_10m),
        precipitationInches: data.current.precipitation ?? 0,
        condition: this.describeWeatherCode(currentCode),
        conditionCode: currentCode,
        isDay: data.current.is_day === 1,
      },
      daily,
      workAdvisory: {
        isRisky: !!risky,
        reason: risky ? `${tomorrow.precipitationProbabilityPct}% chance of rain tomorrow — consider confirming outdoor jobs with customers` : null,
      },
    };
  }

  /** WMO weather interpretation codes — the standard Open-Meteo (and most meteorological APIs) use. */
  private describeWeatherCode(code: number): string {
    if (code === 0) return 'Clear';
    if ([1, 2, 3].includes(code)) return 'Partly Cloudy';
    if ([45, 48].includes(code)) return 'Fog';
    if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
    if ([61, 63, 65, 66, 67].includes(code)) return 'Rain';
    if ([71, 73, 75, 77].includes(code)) return 'Snow';
    if ([80, 81, 82].includes(code)) return 'Rain Showers';
    if ([85, 86].includes(code)) return 'Snow Showers';
    if ([95, 96, 99].includes(code)) return 'Thunderstorm';
    return 'Unknown';
  }
}
