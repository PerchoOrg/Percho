/**
 * Where a city's county is forecast to be in 2050 (phase373) — the city page's
 * Potential tile (owner 2026-11-22: "city potential 能加一个对未来的预测吗").
 *
 * A published forecast, not an extrapolation of ours: the Atlanta Regional
 * Commission's Series 17 population forecasts, adopted February 2024, by
 * county. County, because that is what ARC publishes and what the cities'
 * own growth series already measure; the page says "county" beside it.
 *
 * Figures are the 2020 base and the 2050 forecast from ARC's table. Forsyth's
 * 2020 base (251,283) is the same count the Cumming profile's growth series
 * ends on. A county not listed has no forecast on its page.
 */
import type { CityDetailDTO } from '@percho/shared/city';

const SOURCE = {
  name: 'Atlanta Regional Commission — Series 17 forecasts, 2024',
  url: 'https://33n.atlantaregional.com/wp-content/uploads/2024/02/MC_forecasts_finals17_feb2024.pdf',
};

const COUNTY_2050: Readonly<Record<string, { base: number; forecast: number }>> = {
  forsyth: { base: 251283, forecast: 450124 },
  fulton: { base: 1066710, forecast: 1321079 },
  gwinnett: { base: 957062, forecast: 1200534 },
};

export function cityForecast(county: string | null): CityDetailDTO['forecast'] | undefined {
  const row = COUNTY_2050[(county ?? '').trim().toLowerCase()];
  if (!row || !county) return undefined;
  const pct = Math.round((row.forecast / row.base - 1) * 100);
  return {
    area: `${county.trim()} County`,
    year: 2050,
    value: row.forecast,
    baseYear: 2020,
    baseValue: row.base,
    takeaway: `${pct >= 0 ? '+' : ''}${pct}% from 2020`,
    source: SOURCE,
  };
}
