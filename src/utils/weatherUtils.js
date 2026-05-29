/**
 * Weather Utility — Open-Meteo API
 *
 * Uses Open-Meteo (https://open-meteo.com) which is free, open-source,
 * and requires NO API key for non-commercial use.
 */

// ─── WMO Weather Interpretation Codes ────────────────────────────────────────
export const WMO_CODES = {
    0:  'Clear Sky',
    1:  'Mainly Clear',
    2:  'Partly Cloudy',
    3:  'Overcast',
    45: 'Foggy',
    48: 'Icy Fog',
    51: 'Light Drizzle',
    53: 'Moderate Drizzle',
    55: 'Dense Drizzle',
    56: 'Freezing Drizzle',
    57: 'Heavy Freezing Drizzle',
    61: 'Slight Rain',
    63: 'Moderate Rain',
    65: 'Heavy Rain',
    66: 'Freezing Rain',
    67: 'Heavy Freezing Rain',
    71: 'Slight Snow',
    73: 'Moderate Snow',
    75: 'Heavy Snow',
    77: 'Snow Grains',
    80: 'Slight Showers',
    81: 'Moderate Showers',
    82: 'Heavy Showers',
    85: 'Slight Snow Showers',
    86: 'Heavy Snow Showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm w/ Hail',
    99: 'Thunderstorm w/ Heavy Hail',
};

// ─── Weather Icons (emoji) ────────────────────────────────────────────────────
export const getWeatherIcon = (code, isDay = true) => {
    if (code === 0)  return isDay ? '☀️' : '🌙';
    if (code === 1)  return isDay ? '🌤️' : '🌙';
    if (code === 2)  return '⛅';
    if (code === 3)  return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 57)   return '🌦️';
    if (code >= 61 && code <= 67)   return '🌧️';
    if (code >= 71 && code <= 77)   return '❄️';
    if (code >= 80 && code <= 82)   return '🌧️';
    if (code >= 85 && code <= 86)   return '🌨️';
    if (code >= 95)                 return '⛈️';
    return '🌡️';
};

// ─── Compass Direction ────────────────────────────────────────────────────────
export const degreesToCompass = (deg) => {
    if (deg === null || deg === undefined) return '';
    const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    return dirs[Math.round(deg / 22.5) % 16];
};

// ─── Field Work Suitability ───────────────────────────────────────────────────
export const getFieldWorkStatus = ({ temperatureF, windSpeedMph, windGustsMph, precipitationIn, weatherCode, uvIndex } = {}) => {
    const issues = [];
    if (weatherCode >= 95)                         issues.push({ level: 'danger',  msg: 'Thunderstorm — avoid fieldwork' });
    if (weatherCode >= 65 && weatherCode <= 67)    issues.push({ level: 'danger',  msg: 'Heavy rain' });
    if (weatherCode >= 61 && weatherCode <= 63)    issues.push({ level: 'caution', msg: 'Rain' });
    if (weatherCode >= 71 && weatherCode <= 77)    issues.push({ level: 'caution', msg: 'Snow/ice' });
    if (weatherCode === 45 || weatherCode === 48)  issues.push({ level: 'caution', msg: 'Low visibility fog' });
    if (windGustsMph != null && windGustsMph > 35) issues.push({ level: 'danger',  msg: `High wind gusts ${windGustsMph.toFixed(0)} mph` });
    else if (windSpeedMph != null && windSpeedMph > 25) issues.push({ level: 'caution', msg: `Strong winds ${windSpeedMph.toFixed(0)} mph` });
    if (temperatureF != null && temperatureF > 100) issues.push({ level: 'danger',  msg: 'Extreme heat' });
    else if (temperatureF != null && temperatureF > 95) issues.push({ level: 'caution', msg: 'Very hot' });
    if (temperatureF != null && temperatureF < 28) issues.push({ level: 'danger',  msg: 'Freezing temperatures' });
    if (uvIndex != null && uvIndex >= 8)           issues.push({ level: 'caution', msg: `High UV (${uvIndex})` });
    if (precipitationIn != null && precipitationIn > 0.3) issues.push({ level: 'caution', msg: 'Heavy precipitation' });

    const danger  = issues.filter(i => i.level === 'danger');
    const caution = issues.filter(i => i.level === 'caution');
    if (danger.length)  return { level: 'danger',  label: '🚫 Avoid',   detail: danger[0].msg };
    if (caution.length) return { level: 'caution', label: '⚠️ Caution', detail: caution.map(i => i.msg).join(', ') };
    return { level: 'good', label: '✅ Good Conditions', detail: 'Suitable for outdoor fieldwork' };
};

// ─── Fetch Current Weather (for note-saving) ─────────────────────────────────
export const fetchWeather = async (latitude, longitude) => {
    try {
        const params = new URLSearchParams({
            latitude:  latitude.toFixed(6),
            longitude: longitude.toFixed(6),
            current: ['temperature_2m','relative_humidity_2m','precipitation','weather_code',
                      'wind_speed_10m','wind_direction_10m','wind_gusts_10m'].join(','),
            temperature_unit:   'fahrenheit',
            wind_speed_unit:    'mph',
            precipitation_unit: 'inch',
            timezone:           'auto',
            forecast_days:      1,
        });
        const res  = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const c    = data.current;
        if (!c) throw new Error('No current data');
        const weatherCode = c.weather_code ?? null;
        return {
            temperatureF:    c.temperature_2m        ?? null,
            humidity:        c.relative_humidity_2m  ?? null,
            precipitationIn: c.precipitation         ?? null,
            windSpeedMph:    c.wind_speed_10m        ?? null,
            windGustsMph:    c.wind_gusts_10m        ?? null,
            windDirection:   degreesToCompass(c.wind_direction_10m),
            windDirectionDeg: c.wind_direction_10m   ?? null,
            condition:       WMO_CODES[weatherCode]  ?? `Code ${weatherCode}`,
            weatherCode,
        };
    } catch (err) {
        console.warn('[Weather] fetchWeather failed:', err);
        return null;
    }
};

// ─── Fetch Full Forecast (for Weather Panel) ──────────────────────────────────
/**
 * Fetches current + hourly + daily forecast from Open-Meteo.
 * @param {number} latitude
 * @param {number} longitude
 * @param {string|null} startDate  ISO date string e.g. '2026-05-30', null = today
 * @param {number} days            Number of forecast days (1-16)
 */
export const fetchForecast = async (latitude, longitude, startDate = null, days = 14) => {
    const clampedDays = Math.min(Math.max(days, 1), 16);

    const params = new URLSearchParams({
        latitude:  latitude.toFixed(6),
        longitude: longitude.toFixed(6),

        current: [
            'temperature_2m',
            'apparent_temperature',
            'relative_humidity_2m',
            'precipitation',
            'weather_code',
            'wind_speed_10m',
            'wind_direction_10m',
            'wind_gusts_10m',
            'surface_pressure',
            'cloud_cover',
            'uv_index',
            'is_day',
            'visibility',
        ].join(','),

        hourly: [
            'temperature_2m',
            'apparent_temperature',
            'relative_humidity_2m',
            'dew_point_2m',
            'precipitation_probability',
            'precipitation',
            'weather_code',
            'wind_speed_10m',
            'wind_direction_10m',
            'wind_gusts_10m',
            'uv_index',
            'visibility',
            'cloud_cover',
            'is_day',
        ].join(','),

        daily: [
            'temperature_2m_max',
            'temperature_2m_min',
            'apparent_temperature_max',
            'apparent_temperature_min',
            'precipitation_sum',
            'precipitation_probability_max',
            'weather_code',
            'wind_speed_10m_max',
            'wind_gusts_10m_max',
            'wind_direction_10m_dominant',
            'uv_index_max',
            'sunrise',
            'sunset',
        ].join(','),

        temperature_unit:   'fahrenheit',
        wind_speed_unit:    'mph',
        precipitation_unit: 'inch',
        timezone:           'auto',
        forecast_days:      clampedDays,
    });

    if (startDate) {
        params.delete('forecast_days');
        params.set('start_date', startDate);
        // Safe local parsing to avoid UTC drift
        const end = new Date(startDate + 'T12:00:00');
        end.setDate(end.getDate() + clampedDays - 1);
        const endStr = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
        params.set('end_date', endStr);
    }

    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    console.log('[Weather] fetchForecast:', url);

    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) {
        let errorMsg = `Open-Meteo HTTP ${res.status}`;
        try {
            const errJson = await res.json();
            if (errJson.reason) errorMsg = `Weather API Error: ${errJson.reason}`;
        } catch (e) { /* ignore json parse err */ }
        throw new Error(errorMsg);
    }
    const data = await res.json();


    // ── Normalise Current ──────────────────────────────────────────────────
    const c = data.current ?? {};
    const currentWeather = {
        temperatureF:      c.temperature_2m        ?? null,
        feelsLikeF:        c.apparent_temperature  ?? null,
        humidity:          c.relative_humidity_2m  ?? null,
        precipitationIn:   c.precipitation         ?? null,
        weatherCode:       c.weather_code          ?? null,
        condition:         WMO_CODES[c.weather_code] ?? '—',
        windSpeedMph:      c.wind_speed_10m        ?? null,
        windDirection:     degreesToCompass(c.wind_direction_10m),
        windDirectionDeg:  c.wind_direction_10m    ?? null,
        windGustsMph:      c.wind_gusts_10m        ?? null,
        pressure:          c.surface_pressure      ?? null,
        cloudCover:        c.cloud_cover           ?? null,
        uvIndex:           c.uv_index              ?? null,
        isDay:             c.is_day                ?? 1,
        visibility:        c.visibility            ?? null,
        timezone:          data.timezone           ?? null,
        timezoneAbbr:      data.timezone_abbreviation ?? null,
        fetchedAt:         new Date().toISOString(),
    };

    // ── Normalise Hourly ───────────────────────────────────────────────────
    const h = data.hourly ?? {};
    const hourlyCount = (h.time ?? []).length;
    const hourly = Array.from({ length: hourlyCount }, (_, i) => ({
        time:                 h.time?.[i]                        ?? null,
        temperatureF:         h.temperature_2m?.[i]             ?? null,
        feelsLikeF:           h.apparent_temperature?.[i]       ?? null,
        humidity:             h.relative_humidity_2m?.[i]       ?? null,
        dewPointF:            h.dew_point_2m?.[i]               ?? null,
        precipProbability:    h.precipitation_probability?.[i]  ?? null,
        precipitationIn:      h.precipitation?.[i]              ?? null,
        weatherCode:          h.weather_code?.[i]               ?? null,
        condition:            WMO_CODES[h.weather_code?.[i]]    ?? '—',
        windSpeedMph:         h.wind_speed_10m?.[i]             ?? null,
        windDirection:        degreesToCompass(h.wind_direction_10m?.[i]),
        windDirectionDeg:     h.wind_direction_10m?.[i]         ?? null,
        windGustsMph:         h.wind_gusts_10m?.[i]             ?? null,
        uvIndex:              h.uv_index?.[i]                   ?? null,
        visibility:           h.visibility?.[i]                 ?? null,
        cloudCover:           h.cloud_cover?.[i]                ?? null,
        isDay:                h.is_day?.[i]                     ?? 1,
    }));

    // ── Normalise Daily ────────────────────────────────────────────────────
    const d = data.daily ?? {};
    const dailyCount = (d.time ?? []).length;
    const daily = Array.from({ length: dailyCount }, (_, i) => ({
        date:                 d.time?.[i]                              ?? null,
        highF:                d.temperature_2m_max?.[i]               ?? null,
        lowF:                 d.temperature_2m_min?.[i]               ?? null,
        feelsHighF:           d.apparent_temperature_max?.[i]         ?? null,
        feelsLowF:            d.apparent_temperature_min?.[i]         ?? null,
        precipSumIn:          d.precipitation_sum?.[i]                ?? null,
        precipProbability:    d.precipitation_probability_max?.[i]    ?? null,
        weatherCode:          d.weather_code?.[i]                     ?? null,
        condition:            WMO_CODES[d.weather_code?.[i]]          ?? '—',
        windSpeedMaxMph:      d.wind_speed_10m_max?.[i]               ?? null,
        windGustsMaxMph:      d.wind_gusts_10m_max?.[i]               ?? null,
        windDirDominant:      degreesToCompass(d.wind_direction_10m_dominant?.[i]),
        uvIndexMax:           d.uv_index_max?.[i]                     ?? null,
        sunrise:              d.sunrise?.[i]                          ?? null,
        sunset:               d.sunset?.[i]                           ?? null,
    }));

    return { current: currentWeather, hourly, daily, timezone: data.timezone };
};

// ─── Format weather string (for note header) ──────────────────────────────────
export const formatWeatherString = (weather) => {
    if (!weather) return 'Weather unavailable';
    const parts = [];
    if (weather.temperatureF != null) parts.push(`${weather.temperatureF.toFixed(1)}°F`);
    if (weather.condition)            parts.push(weather.condition);
    const meta = [];
    if (weather.humidity != null)     meta.push(`Humidity: ${weather.humidity}%`);
    if (weather.windSpeedMph != null) {
        let w = `Wind: ${weather.windSpeedMph.toFixed(1)} mph`;
        if (weather.windDirection)    w += ` ${weather.windDirection}`;
        if (weather.windGustsMph != null && weather.windGustsMph > weather.windSpeedMph)
            w += ` (gusts ${weather.windGustsMph.toFixed(1)} mph)`;
        meta.push(w);
    }
    if (weather.precipitationIn != null) meta.push(`Precip: ${weather.precipitationIn.toFixed(2)} in`);
    return [parts.join(', '), ...meta].join(' | ');
};
