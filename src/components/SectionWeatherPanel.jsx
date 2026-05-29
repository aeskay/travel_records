import { useState, useEffect, useRef, useCallback } from 'react';
import {
    fetchForecast, getWeatherIcon, getFieldWorkStatus
} from '../utils/weatherUtils';
import { getSharedDaysPlan } from '../db';
import {
    ChevronDown, ChevronUp, RefreshCw, Wind, Droplets,
    Eye, Gauge, Sun, CloudRain, Calendar, ChevronRight
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtTemp  = (v) => v != null ? `${Math.round(v)}°` : '—';
const fmtPct   = (v) => v != null ? `${Math.round(v)}%` : '—';
const fmtMph   = (v) => v != null ? `${Math.round(v)}` : '—';
const fmtIn    = (v) => v != null ? `${v.toFixed(2)}"` : '—';
const fmtVis   = (v) => v != null ? `${(v / 5280).toFixed(1)} mi` : '—';

const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _d = new Date();
const todayStr = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;


const formatHourLabel = (isoTime) => {
    if (!isoTime) return '—';
    const d = new Date(isoTime);
    const h = d.getHours();
    if (h === 0)  return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? `${h}am` : `${h - 12}pm`;
};

const formatDayLabel = (isoDate, refDate) => {
    if (!isoDate) return '—';
    if (isoDate === todayStr)    return 'Today';
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
    if (isoDate === tomorrowStr) return 'Tmrw';

    const d = new Date(isoDate + 'T12:00:00');
    return DAY_NAMES[d.getDay()];
};

const formatFullDate = (isoDate) => {
    if (!isoDate) return '';
    const d = new Date(isoDate + 'T12:00:00');
    return `${DAY_NAMES[d.getDay()]}, ${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
};

const formatTime = (isoStr) => {
    if (!isoStr) return '—';
    const d = new Date(isoStr);
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    if (h > 12) h -= 12; if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2,'0')}${ampm}`;
};

const precipColor = (pct) => {
    if (pct == null || pct < 20) return '#60a5fa';
    if (pct >= 80) return '#ef4444';
    if (pct >= 60) return '#f97316';
    if (pct >= 40) return '#eab308';
    return '#3b82f6';
};

const uvLabel = (uv) => {
    if (uv == null)  return { text: '—',         color: '#94a3b8' };
    if (uv >= 11)    return { text: 'Extreme',   color: '#7c3aed' };
    if (uv >= 8)     return { text: 'Very High', color: '#ef4444' };
    if (uv >= 6)     return { text: 'High',      color: '#f97316' };
    if (uv >= 3)     return { text: 'Moderate',  color: '#eab308' };
    return           { text: 'Low',              color: '#22c55e' };
};

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
const SkeletonPulse = ({ w = '100%', h = 16, r = 6, style = {} }) => (
    <div style={{
        width: w, height: h, borderRadius: r,
        background: 'hsl(var(--muted))',
        animation: 'weather-pulse 1.4s ease-in-out infinite',
        ...style,
    }} />
);

// ─── Current Conditions ───────────────────────────────────────────────────────
const CurrentCard = ({ current, assignedDate }) => {
    if (!current) return null;
    const icon      = getWeatherIcon(current.weatherCode, current.isDay);
    const fieldWork = getFieldWorkStatus({
        temperatureF:    current.temperatureF,
        windSpeedMph:    current.windSpeedMph,
        windGustsMph:    current.windGustsMph,
        precipitationIn: current.precipitationIn,
        weatherCode:     current.weatherCode,
        uvIndex:         current.uvIndex,
    });
    const uv = uvLabel(current.uvIndex);
    const fc = {
        good:    { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.35)',  text: '#22c55e' },
        caution: { bg: 'rgba(234,179,8,0.12)',  border: 'rgba(234,179,8,0.35)', text: '#eab308' },
        danger:  { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.35)', text: '#ef4444' },
    }[fieldWork.level];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Assigned-day notice */}
            {assignedDate && assignedDate !== todayStr && (
                <div style={{
                    padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    background: 'hsl(var(--primary)/0.1)', border: '1px solid hsl(var(--primary)/0.3)',
                    color: 'hsl(var(--primary))', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <Calendar size={12} />
                    Viewing current conditions — your assigned visit day is <strong>{formatFullDate(assignedDate)}</strong>
                </div>
            )}

            {/* Field-work banner */}
            <div style={{
                padding: '8px 14px', borderRadius: 10,
                background: fc.bg, border: `1px solid ${fc.border}`,
                display: 'flex', alignItems: 'center', gap: 8,
            }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: fc.text }}>{fieldWork.label}</span>
                <span style={{ fontSize: 12, color: 'hsl(var(--muted-foreground))' }}>— {fieldWork.detail}</span>
            </div>

            {/* Main temp + icon */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 60, lineHeight: 1 }}>{icon}</span>
                <div>
                    <div style={{ fontSize: 50, fontWeight: 800, lineHeight: 1, letterSpacing: '-2px' }}>
                        {fmtTemp(current.temperatureF)}
                    </div>
                    <div style={{ fontSize: 13, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                        Feels like {fmtTemp(current.feelsLikeF)} &nbsp;•&nbsp; {current.condition}
                    </div>
                    {current.timezoneAbbr && (
                        <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 2 }}>
                            {current.timezone} ({current.timezoneAbbr})
                        </div>
                    )}
                </div>
            </div>

            {/* Stats grid */}
            <div className="wx-stats-grid">
                <StatTile icon={<Droplets size={14}/>}  label="Humidity"   value={fmtPct(current.humidity)} />
                <StatTile icon={<Wind size={14}/>}      label="Wind"       value={`${fmtMph(current.windSpeedMph)} mph ${current.windDirection}`}
                    sub={current.windGustsMph ? `Gusts ${fmtMph(current.windGustsMph)} mph` : null} />
                <StatTile icon={<CloudRain size={14}/>} label="Precip"     value={fmtIn(current.precipitationIn)} />
                <StatTile icon={<Sun size={14}/>}       label="UV Index"   value={`${current.uvIndex ?? '—'}`}
                    sub={<span style={{ color: uv.color, fontWeight: 600 }}>{uv.text}</span>} />
                <StatTile icon={<Eye size={14}/>}       label="Visibility" value={fmtVis(current.visibility)} />
                <StatTile icon={<Gauge size={14}/>}     label="Pressure"   value={current.pressure ? `${Math.round(current.pressure)} hPa` : '—'} />
            </div>
        </div>
    );
};

const StatTile = ({ icon, label, value, sub }) => (
    <div className="wx-stat-tile">
        <div style={{ display:'flex', alignItems:'center', gap:5, color:'hsl(var(--muted-foreground))', fontSize:11, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>
            {icon}{label}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))', marginTop: 1 }}>{sub}</div>}
    </div>
);

// ─── Hourly Strip ─────────────────────────────────────────────────────────────
const HourlyStrip = ({ hourly, selectedDate, assignedDate }) => {
    const scrollRef  = useRef(null);
    const activeRef  = useRef(null);
    const _now    = new Date();
    const nowIso  = `${_now.getFullYear()}-${String(_now.getMonth()+1).padStart(2,'0')}-${String(_now.getDate()).padStart(2,'0')}T${String(_now.getHours()).padStart(2,'0')}`; // local 'YYYY-MM-DDTHH'


    // Determine which date to show: selectedDate > assignedDate > today
    const viewDate = selectedDate || assignedDate || null;

    const filtered = viewDate
        ? hourly.filter(h => h.time?.startsWith(viewDate))
        : hourly.filter(h => h.time >= nowIso.slice(0, 13) + ':00').slice(0, 24);

    useEffect(() => {
        if (activeRef.current && scrollRef.current) {
            setTimeout(() => {
                activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }, 80);
        }
    }, [filtered.length, viewDate]);

    if (!filtered.length) return (
        <div style={{ padding: '12px', color: 'hsl(var(--muted-foreground))', fontSize: 13 }}>
            No hourly data for this day yet — try expanding the forecast range.
        </div>
    );

    return (
        /* Wrapper with gradient fade at edges on desktop */
        <div style={{ position: 'relative' }}>
            <div ref={scrollRef} className="wx-hourly-scroll">
                {filtered.map((h, i) => {
                    const isNow  = !viewDate && h.time?.slice(0, 13) === nowIso;
                    const isFirst = i === 0 && viewDate;
                    const icon   = getWeatherIcon(h.weatherCode, h.isDay);
                    const pp     = h.precipProbability ?? 0;
                    return (
                        <div
                            key={h.time ?? i}
                            ref={(isNow || isFirst) ? activeRef : null}
                            className={`wx-hour-slot${isNow ? ' wx-hour-now' : ''}`}
                        >
                            <div className="wx-hour-time">{isNow ? 'Now' : formatHourLabel(h.time)}</div>
                            <div style={{ fontSize: 22, margin: '4px 0' }}>{icon}</div>
                            <div className="wx-hour-temp">{fmtTemp(h.temperatureF)}</div>
                            {pp >= 10 ? (
                                <div className="wx-hour-precip" style={{ color: precipColor(pp) }}>
                                    💧{Math.round(pp)}%
                                </div>
                            ) : <div style={{ height: 14 }} />}
                            <div style={{ fontSize: 9, color: 'hsl(var(--muted-foreground))', marginTop: 2, textAlign: 'center' }}>
                                {fmtMph(h.windSpeedMph)}mph
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ─── Daily Row ────────────────────────────────────────────────────────────────
const DailyRow = ({ day, isSelected, isAssigned, onClick }) => {
    const icon      = getWeatherIcon(day.weatherCode, true);
    const pp        = day.precipProbability ?? 0;
    const barW      = `${Math.min(pp, 100)}%`;
    const fieldWork = getFieldWorkStatus({
        temperatureF:    day.highF,
        windSpeedMph:    day.windSpeedMaxMph,
        windGustsMph:    day.windGustsMaxMph,
        precipitationIn: day.precipSumIn,
        weatherCode:     day.weatherCode,
        uvIndex:         day.uvIndexMax,
    });
    const dotColor = { good: '#22c55e', caution: '#eab308', danger: '#ef4444' }[fieldWork.level];

    return (
        <div
            className={`wx-daily-row${isSelected ? ' wx-daily-selected' : ''}${isAssigned ? ' wx-daily-assigned' : ''}`}
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onClick()}
        >
            {/* Day */}
            <div className="wx-daily-day">
                <span style={{ width:7, height:7, borderRadius:'50%', background: dotColor, display:'inline-block', marginRight:4, flexShrink:0 }} />
                <span style={{ fontWeight:700, fontSize:13, minWidth:38 }}>{formatDayLabel(day.date)}</span>
                <span style={{ fontSize:10, color:'hsl(var(--muted-foreground))' }}>
                    {MONTH_NAMES[new Date(day.date+'T12:00:00').getMonth()]} {new Date(day.date+'T12:00:00').getDate()}
                </span>
                {isAssigned && (
                    <span style={{
                        fontSize: 9, fontWeight: 700, background: 'hsl(var(--primary))', color: '#fff',
                        borderRadius: 4, padding: '1px 5px', marginLeft: 4, letterSpacing: '0.04em',
                    }}>VISIT</span>
                )}
            </div>

            {/* Icon + condition */}
            <div style={{ display:'flex', alignItems:'center', gap:4, minWidth:80, flex:1 }}>
                <span style={{ fontSize:20 }}>{icon}</span>
                <span style={{ fontSize:11, color:'hsl(var(--muted-foreground))', lineHeight:1.2 }}>{day.condition}</span>
            </div>

            {/* Precip bar */}
            <div style={{ display:'flex', flexDirection:'column', gap:2, minWidth:60 }}>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'hsl(var(--muted-foreground))' }}>
                    <span>{fmtIn(day.precipSumIn)}</span>
                    <span style={{ color: precipColor(pp) }}>{fmtPct(pp)}</span>
                </div>
                <div style={{ height:3, borderRadius:99, background:'hsl(var(--muted))', overflow:'hidden' }}>
                    <div style={{ width:barW, height:'100%', background: precipColor(pp), borderRadius:99, transition:'width 0.4s' }} />
                </div>
            </div>

            {/* High/Low */}
            <div style={{ textAlign:'right', minWidth:60, flexShrink:0 }}>
                <span style={{ fontWeight:700, fontSize:14 }}>{fmtTemp(day.highF)}</span>
                <span style={{ color:'hsl(var(--muted-foreground))', fontSize:12 }}> / {fmtTemp(day.lowF)}</span>
            </div>

            <ChevronRight size={14} style={{ color:'hsl(var(--muted-foreground))', flexShrink:0 }} />
        </div>
    );
};

// ─── Day Detail Drawer ────────────────────────────────────────────────────────
const DayDetailDrawer = ({ day }) => {
    if (!day) return null;
    const uv = uvLabel(day.uvIndexMax);
    return (
        <div className="wx-day-drawer">
            <div style={{ fontWeight:700, marginBottom:8, fontSize:13 }}>{formatFullDate(day.date)} — Details</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(110px, 1fr))', gap:8 }}>
                <MiniTile label="High"       value={fmtTemp(day.highF)} />
                <MiniTile label="Low"        value={fmtTemp(day.lowF)} />
                <MiniTile label="Feels High" value={fmtTemp(day.feelsHighF)} />
                <MiniTile label="Feels Low"  value={fmtTemp(day.feelsLowF)} />
                <MiniTile label="Precip"     value={fmtIn(day.precipSumIn)} />
                <MiniTile label="Rain %"     value={fmtPct(day.precipProbability)} />
                <MiniTile label="Wind Max"   value={`${fmtMph(day.windSpeedMaxMph)} mph`} />
                <MiniTile label="Gusts"      value={`${fmtMph(day.windGustsMaxMph)} mph`} />
                <MiniTile label="Wind Dir"   value={day.windDirDominant || '—'} />
                <MiniTile label="UV Max"     value={`${day.uvIndexMax ?? '—'}`}
                    extra={<span style={{ fontSize:10, color:uv.color }}>{uv.text}</span>} />
                <MiniTile label="Sunrise"    value={formatTime(day.sunrise)} />
                <MiniTile label="Sunset"     value={formatTime(day.sunset)} />
            </div>
        </div>
    );
};

const MiniTile = ({ label, value, extra }) => (
    <div style={{ background:'hsl(var(--muted)/0.4)', borderRadius:8, padding:'8px 10px' }}>
        <div style={{ fontSize:10, color:'hsl(var(--muted-foreground))', fontWeight:600, textTransform:'uppercase' }}>{label}</div>
        <div style={{ fontSize:15, fontWeight:700, marginTop:2 }}>{value}</div>
        {extra && <div style={{ marginTop:1 }}>{extra}</div>}
    </div>
);

// ─── Main Panel ───────────────────────────────────────────────────────────────
const SectionWeatherPanel = ({ section }) => {
    // Parse start coordinates
    const coords = (() => {
        const raw = section?.coordinates;
        if (!raw) return null;
        const parts = raw.split(',').map(s => parseFloat(s.trim()));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1]))
            return { lat: parts[0], lng: parts[1] };
        return null;
    })();

    const lsKey = `wx-open-${section?.id || 'default'}`;

    // ── State ──────────────────────────────────────────────────────────────
    const [isOpen,       setIsOpen]       = useState(() => {
        try { return localStorage.getItem(lsKey) === 'true'; } catch { return false; }
    });
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState(null);
    const [forecast,     setForecast]     = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);
    const [selectedDay,  setSelectedDay]  = useState(null);
    const [days,         setDays]         = useState(14);
    const [calendarDate, setCalendarDate] = useState('');
    const [activeTab,    setActiveTab]    = useState('hourly');
    const [assignedDate, setAssignedDate] = useState(null); // from daysPlan
    const [assignedDayNum, setAssignedDayNum] = useState(null);

    // ── Look up assigned day date from daysPlan ────────────────────────────
    useEffect(() => {
        const projectId = section?.projectId;
        const seq = section?.test_sequence ? parseInt(section.test_sequence, 10) : null;
        if (!projectId || seq == null) return;

        getSharedDaysPlan(projectId).then(plan => {
            const dayEntry = plan.find(d => d.sequences?.includes(seq));
            if (dayEntry?.date) {
                setAssignedDate(dayEntry.date);
                setAssignedDayNum(dayEntry.day);
            } else {
                setAssignedDate(null);
                setAssignedDayNum(null);
            }
        }).catch(() => {});
    }, [section?.id, section?.projectId, section?.test_sequence]);

    // When assignedDate is resolved and user hasn't manually selected a date,
    // auto-select the assigned date's hourly view
    useEffect(() => {
        if (assignedDate && !selectedDate && forecast) {
            const dayObj = forecast.daily?.find(d => d.date === assignedDate);
            if (dayObj) {
                setSelectedDate(assignedDate);
                setSelectedDay(dayObj);
            } else if (assignedDate > todayStr) {
                // It's a future date not yet in the forecast window — trigger fetch
                loadForecast(null, 16);
            }
        }
    }, [assignedDate, forecast]);

    // ── Fetch ──────────────────────────────────────────────────────────────
    const loadForecast = useCallback(async (startDate = null, numDays = days) => {
        if (!coords) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchForecast(coords.lat, coords.lng, startDate, numDays);
            setForecast(data);
        } catch (e) {
            console.error('[WeatherPanel]', e);
            setError('Could not load weather data. Check your connection.');
        } finally {
            setLoading(false);
        }
    }, [coords, days]);

    useEffect(() => {
        if (isOpen && !forecast && coords) loadForecast();
    }, [isOpen, coords]);

    const toggleOpen = () => {
        const next = !isOpen;
        setIsOpen(next);
        try { localStorage.setItem(lsKey, String(next)); } catch {}
        if (next && !forecast && coords) loadForecast();
    };

    const handleDayClick = (day) => {
        setSelectedDate(day.date);
        setSelectedDay(day);
        setActiveTab('hourly');
    };

    const handleLoadMore = () => {
        const newDays = Math.min(days + 7, 16);
        setDays(newDays);
        loadForecast(null, newDays);
    };

    const handleCalendar = (e) => {
        const val = e.target.value;
        setCalendarDate(val);
        if (!val) return;
        const existing = forecast?.daily?.find(d => d.date === val);
        if (existing) {
            setSelectedDate(val);
            setSelectedDay(existing);
            setActiveTab('hourly');
        } else {
            loadForecast(val, 7);
            setSelectedDate(val);
            setSelectedDay(null);
        }
    };

    const clearDayFilter = () => {
        // If assigned date exists, go back to it; otherwise back to today
        if (assignedDate && assignedDate !== todayStr) {
            const dayObj = forecast?.daily?.find(d => d.date === assignedDate);
            setSelectedDate(assignedDate);
            setSelectedDay(dayObj || null);
        } else {
            setSelectedDate(null);
            setSelectedDay(null);
        }
        setCalendarDate('');
    };

    // ── Derived ────────────────────────────────────────────────────────────
    const locLabel = [section?.city, section?.county].filter(Boolean).join(', ') || 'this location';
    const maxDateStr = (() => { const d = new Date(); d.setDate(d.getDate() + 15); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();

    const collapsedPreview = forecast?.current
        ? `${Math.round(forecast.current.temperatureF)}°F  ${getWeatherIcon(forecast.current.weatherCode, forecast.current.isDay)}  ${forecast.current.condition}`
        : null;

    // Label for the "back" button in hourly view
    const backLabel = assignedDate && assignedDate !== todayStr ? `Back to ${formatFullDate(assignedDate)}` : 'Back to today';
    const activeHourlyDate = selectedDate || assignedDate || null;

    if (!coords) {
        return (
            <div className="card wx-panel wx-no-coords">
                <div className="wx-panel-header">
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:20 }}>🌤️</span>
                        <span style={{ fontWeight:700 }}>Weather Forecast</span>
                    </div>
                    <span style={{ fontSize:12, color:'hsl(var(--muted-foreground))' }}>No coordinates for this section</span>
                </div>
            </div>
        );
    }

    return (
        <>
            <style>{`
                @keyframes weather-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
                @keyframes wx-slide-in { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
                @keyframes spin { to{transform:rotate(360deg)} }

                .wx-panel { overflow: hidden; }

                .wx-panel-header {
                    display: flex; align-items: center; justify-content: space-between;
                    cursor: pointer; user-select: none; padding: 14px 16px; gap: 10px;
                    transition: background 0.15s;
                }
                .wx-panel-header:hover { background: hsl(var(--muted)/0.2); }
                .wx-panel-body { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 16px; }

                .wx-stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
                    gap: 8px;
                }
                .wx-stat-tile { background: hsl(var(--muted)/0.35); border-radius: 10px; padding: 10px 12px; }

                /* ── Hourly scroll — bigger scrollbar on desktop ── */
                .wx-hourly-scroll {
                    display: flex; gap: 4px; overflow-x: auto;
                    padding: 8px 4px 14px; scroll-snap-type: x mandatory;
                    -webkit-overflow-scrolling: touch;
                    scrollbar-width: thin;                          /* Firefox */
                    scrollbar-color: hsl(var(--primary)/0.5) hsl(var(--muted)/0.3); /* Firefox */
                    cursor: grab;
                }
                .wx-hourly-scroll:active { cursor: grabbing; }
                /* Chrome/Safari/Edge — thicker, visible scrollbar */
                .wx-hourly-scroll::-webkit-scrollbar        { height: 8px; }
                .wx-hourly-scroll::-webkit-scrollbar-track  { background: hsl(var(--muted)/0.3); border-radius: 99px; }
                .wx-hourly-scroll::-webkit-scrollbar-thumb  {
                    background: hsl(var(--primary)/0.5); border-radius: 99px;
                    border: 2px solid hsl(var(--card));
                }
                .wx-hourly-scroll::-webkit-scrollbar-thumb:hover { background: hsl(var(--primary)/0.8); }

                .wx-hour-slot {
                    display: flex; flex-direction: column; align-items: center;
                    min-width: 62px; padding: 8px 6px; border-radius: 12px;
                    scroll-snap-align: start; flex-shrink: 0;
                    border: 1px solid transparent;
                    transition: background 0.15s, border-color 0.15s;
                }
                .wx-hour-now {
                    background: hsl(var(--primary)/0.18) !important;
                    border-color: hsl(var(--primary)/0.5) !important;
                }
                .wx-hour-time   { font-size: 11px; font-weight: 600; color: hsl(var(--muted-foreground)); }
                .wx-hour-temp   { font-size: 15px; font-weight: 700; }
                .wx-hour-precip { font-size: 10px; font-weight: 600; margin-top: 2px; }

                .wx-daily-row {
                    display: flex; align-items: center; gap: 10px;
                    padding: 11px 12px; border-radius: 10px;
                    cursor: pointer; transition: background 0.15s;
                    border: 1px solid transparent;
                }
                .wx-daily-row:hover    { background: hsl(var(--muted)/0.3); }
                .wx-daily-selected     { background: hsl(var(--primary)/0.12) !important; border-color: hsl(var(--primary)/0.4) !important; }
                .wx-daily-assigned     { border-left: 3px solid hsl(var(--primary)) !important; padding-left: 9px; }
                .wx-daily-day          { display: flex; align-items: center; gap: 4px; min-width: 100px; flex-shrink: 0; }

                .wx-day-drawer {
                    background: hsl(var(--muted)/0.2); border: 1px solid hsl(var(--border));
                    border-radius: 12px; padding: 12px 14px; margin-top: -2px;
                    animation: wx-slide-in 0.2s ease;
                }

                .wx-tab-bar { display: flex; gap: 4px; border-bottom: 1px solid hsl(var(--border)); }
                .wx-tab {
                    padding: 6px 14px; border-radius: 8px 8px 0 0; font-size: 12px; font-weight: 600;
                    cursor: pointer; border: none; background: none; color: hsl(var(--muted-foreground));
                    border-bottom: 2px solid transparent; transition: color 0.15s, border-color 0.15s;
                }
                .wx-tab:hover  { color: hsl(var(--foreground)); }
                .wx-tab.active { color: hsl(var(--primary)); border-bottom-color: hsl(var(--primary)); }

                .wx-refresh-btn {
                    background: none; border: none; cursor: pointer;
                    color: hsl(var(--muted-foreground)); padding: 4px; border-radius: 6px;
                    display: flex; align-items: center; transition: color 0.15s, background 0.15s;
                }
                .wx-refresh-btn:hover { color: hsl(var(--foreground)); background: hsl(var(--muted)/0.4); }

                .wx-calendar-btn {
                    display: inline-flex; align-items: center; gap: 6px;
                    padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
                    border: 1px solid hsl(var(--border)); background: hsl(var(--card));
                    color: hsl(var(--foreground)); cursor: pointer; position: relative;
                    transition: border-color 0.15s, background 0.15s;
                }
                .wx-calendar-btn:hover { border-color: hsl(var(--primary)/0.6); background: hsl(var(--muted)/0.3); }
                .wx-calendar-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }

                .wx-load-more-btn {
                    display: flex; align-items: center; justify-content: center; gap: 6px;
                    padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 600;
                    border: 1px solid hsl(var(--border)); background: hsl(var(--card));
                    color: hsl(var(--foreground)); cursor: pointer; width: 100%;
                    transition: border-color 0.15s, background 0.15s;
                }
                .wx-load-more-btn:hover    { border-color: hsl(var(--primary)/0.6); background: hsl(var(--muted)/0.3); }
                .wx-load-more-btn:disabled { opacity: 0.5; cursor: default; }

                .wx-error    { text-align: center; padding: 20px; color: #ef4444; font-size: 13px; }
                .wx-no-coords { opacity: 0.7; }
            `}</style>

            <div className="card wx-panel">
                {/* ── Collapsible Header ── */}
                <div className="wx-panel-header" onClick={toggleOpen} role="button" tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && toggleOpen()}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', flex:1 }}>
                        <span style={{ fontSize:20 }}>🌤️</span>
                        <span style={{ fontWeight:700, fontSize:14 }}>Weather Forecast</span>
                        <span style={{ fontSize:12, color:'hsl(var(--muted-foreground))' }}>{locLabel}</span>
                        {assignedDate && (
                            <span style={{
                                fontSize:11, fontWeight:600, padding:'2px 8px', borderRadius:99,
                                background:'hsl(var(--primary)/0.12)', color:'hsl(var(--primary))',
                                display:'flex', alignItems:'center', gap:4,
                            }}>
                                <Calendar size={10} /> Day {assignedDayNum} · {formatFullDate(assignedDate)}
                            </span>
                        )}
                        {!isOpen && collapsedPreview && (
                            <span style={{
                                fontSize:13, fontWeight:600, padding:'2px 10px', borderRadius:99,
                                background:'hsl(var(--muted)/0.4)', color:'hsl(var(--foreground))',
                            }}>
                                {collapsedPreview}
                            </span>
                        )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        {loading && <RefreshCw size={14} style={{ animation:'spin 1s linear infinite' }} />}
                        <button className="wx-refresh-btn" title="Refresh"
                            onClick={(e) => { e.stopPropagation(); loadForecast(); }}>
                            <RefreshCw size={14} />
                        </button>
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                </div>

                {/* ── Body ── */}
                {isOpen && (
                    <div className="wx-panel-body">

                        {/* Skeleton */}
                        {loading && !forecast && (
                            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                                <div style={{ display:'flex', gap:12, alignItems:'flex-end' }}>
                                    <SkeletonPulse w={60} h={60} r={16} />
                                    <div style={{ flex:1, display:'flex', flexDirection:'column', gap:6 }}>
                                        <SkeletonPulse h={36} w="55%" />
                                        <SkeletonPulse h={13} w="38%" />
                                    </div>
                                </div>
                                <div style={{ display:'flex', gap:8 }}>
                                    {[1,2,3,4,5,6].map(k => <SkeletonPulse key={k} w={80} h={70} r={10} />)}
                                </div>
                                <SkeletonPulse h={180} r={12} />
                            </div>
                        )}

                        {/* Error */}
                        {error && !loading && (
                            <div className="wx-error">
                                <div>{error}</div>
                                <button className="wx-load-more-btn" style={{ marginTop:10, width:'auto' }}
                                    onClick={() => loadForecast()}>
                                    <RefreshCw size={14}/> Retry
                                </button>
                            </div>
                        )}

                        {forecast && !error && (
                            <>
                                <CurrentCard current={forecast.current} assignedDate={assignedDate} />

                                <div style={{ fontSize:10, color:'hsl(var(--muted-foreground))', textAlign:'right', marginTop:-8 }}>
                                    Updated {new Date(forecast.current.fetchedAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                                    {loading && <span> · <RefreshCw size={9} style={{ display:'inline', animation:'spin 1s linear infinite' }}/> Refreshing…</span>}
                                </div>

                                {/* Tabs */}
                                <div>
                                    <div className="wx-tab-bar">
                                        <button className={`wx-tab${activeTab==='hourly'?' active':''}`}
                                            onClick={() => setActiveTab('hourly')}>Hourly</button>
                                        <button className={`wx-tab${activeTab==='daily'?' active':''}`}
                                            onClick={() => setActiveTab('daily')}>14-Day</button>
                                    </div>

                                    {/* Hourly */}
                                    {activeTab === 'hourly' && (
                                        <div style={{ paddingTop:12 }}>
                                            {/* ── Always-visible date header ── */}
                                            <div style={{
                                                display:'flex', alignItems:'center', justifyContent:'space-between',
                                                marginBottom:10, flexWrap:'wrap', gap:6,
                                            }}>
                                                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                                    <span style={{
                                                        fontSize:13, fontWeight:700,
                                                        padding:'4px 12px', borderRadius:99,
                                                        background: activeHourlyDate === todayStr || !activeHourlyDate
                                                            ? 'hsl(var(--muted)/0.5)'
                                                            : 'hsl(var(--primary)/0.15)',
                                                        color: activeHourlyDate === todayStr || !activeHourlyDate
                                                            ? 'hsl(var(--foreground))'
                                                            : 'hsl(var(--primary))',
                                                        border: '1px solid',
                                                        borderColor: activeHourlyDate === todayStr || !activeHourlyDate
                                                            ? 'hsl(var(--border))'
                                                            : 'hsl(var(--primary)/0.35)',
                                                    }}>
                                                        {!activeHourlyDate || activeHourlyDate === todayStr
                                                            ? `Today — ${formatFullDate(todayStr)}`
                                                            : formatFullDate(activeHourlyDate)
                                                        }
                                                    </span>
                                                    {assignedDate && assignedDate === activeHourlyDate && (
                                                        <span style={{
                                                            fontSize:10, fontWeight:700,
                                                            background:'hsl(var(--primary))', color:'#fff',
                                                            borderRadius:4, padding:'2px 7px',
                                                        }}>VISIT DAY</span>
                                                    )}
                                                </div>
                                                {activeHourlyDate && activeHourlyDate !== todayStr && (
                                                    <button onClick={clearDayFilter}
                                                        style={{
                                                            fontSize:11, color:'hsl(var(--muted-foreground))',
                                                            background:'none', border:'1px solid hsl(var(--border))',
                                                            borderRadius:6, padding:'3px 10px', cursor:'pointer',
                                                        }}>← Back to today</button>
                                                )}
                                            </div>
                                            <HourlyStrip
                                                hourly={forecast.hourly}
                                                selectedDate={selectedDate}
                                                assignedDate={assignedDate}
                                            />
                                            {selectedDay && <DayDetailDrawer day={selectedDay} />}
                                        </div>
                                    )}

                                    {/* Daily */}
                                    {activeTab === 'daily' && (
                                        <div style={{ paddingTop:12, display:'flex', flexDirection:'column', gap:3 }}>
                                            {forecast.daily.map((day) => (
                                                <DailyRow
                                                    key={day.date}
                                                    day={day}
                                                    isSelected={selectedDate === day.date}
                                                    isAssigned={assignedDate === day.date}
                                                    onClick={() => handleDayClick(day)}
                                                />
                                            ))}

                                            <div style={{ display:'flex', gap:8, marginTop:8, flexWrap:'wrap', alignItems:'center' }}>
                                                <button
                                                    className="wx-calendar-btn"
                                                    onClick={(e) => {
                                                        const inp = e.currentTarget.querySelector('input');
                                                        if (inp && inp.showPicker) inp.showPicker();
                                                    }}
                                                >
                                                    <Calendar size={14} />
                                                    {calendarDate ? formatFullDate(calendarDate) : 'Pick Date'}
                                                    <input
                                                        type="date"
                                                        value={calendarDate}
                                                        max={maxDateStr}
                                                        onChange={handleCalendar}
                                                        onClick={(e) => e.stopPropagation()}
                                                        style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                                                    />
                                                </button>

                                                <button className="wx-load-more-btn" style={{ flex:1, minWidth:120 }}
                                                    onClick={handleLoadMore}
                                                    disabled={loading || days >= 16}
                                                    title={days >= 16 ? 'Maximum 16-day forecast' : `Load more days`}>
                                                    {loading
                                                        ? <><RefreshCw size={12} style={{ animation:'spin 1s linear infinite' }}/> Loading…</>
                                                        : days >= 16 ? '✓ All 16 days loaded' : `Load More Days (${days}/16)`
                                                    }
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>
        </>
    );
};

export default SectionWeatherPanel;
