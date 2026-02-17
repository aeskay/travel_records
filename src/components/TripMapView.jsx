import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft, MapPin, Navigation, CheckCircle, Clock, ExternalLink, Building2, Route, Home, Hash, Trash2, Save, Landmark, Calendar, Plus, X, ChevronDown, ChevronUp, Eye, EyeOff } from 'lucide-react';

import 'leaflet/dist/leaflet.css';
import { saveSharedDaysPlan, getSharedDaysPlan } from '../db';

// --- Constants ---
const HOME_POSITION = [33.58703457593024, -101.87436165377096];
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

// --- Custom Marker Icons ---
const createMarkerIcon = (color, borderColor) => {
    return L.divIcon({
        className: 'custom-map-marker',
        html: `<div style="
            width: 14px; height: 14px;
            background: ${color};
            border: 3px solid ${borderColor};
            border-radius: 50%;
            box-shadow: 0 0 8px ${color}88, 0 2px 6px rgba(0,0,0,0.4);
        "></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -14],
    });
};

const createSequenceIcon = (number, color, borderColor) => {
    return L.divIcon({
        className: 'custom-map-marker',
        html: `<div class="sequence-marker" style="
            background: ${color};
            border: 2px solid ${borderColor};
            box-shadow: 0 0 8px ${color}66, 0 2px 6px rgba(0,0,0,0.4);
        ">${number}</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
        popupAnchor: [0, -16],
    });
};

const homeIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div class="home-marker">🏠</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
});

const evaluatedIcon = createMarkerIcon('#22c55e', '#16a34a');
const pendingIcon = createMarkerIcon('#f59e0b', '#d97706');
const selectedIcon = createMarkerIcon('#3b82f6', '#2563eb');

// --- Category Color Palette ---
const CATEGORY_COLORS = [
    '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6',
    '#06b6d4', '#ef4444', '#84cc16', '#f43f5e', '#0ea5e9',
    '#a855f7', '#10b981', '#e879f9', '#facc15', '#34d399',
];

const getCategoryColor = (type, allTypes) => {
    const idx = allTypes.indexOf(type);
    return CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
};

// --- Parse coordinates helper ---
const parseCoords = (coordString) => {
    if (!coordString) return null;
    const parts = coordString.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return [parts[0], parts[1]];
    }
    return null;
};

// --- Component to fit map bounds (initial only) ---
const FitBounds = ({ positions }) => {
    const map = useMap();
    const hasFitted = useRef(false);

    useEffect(() => {
        if (positions.length > 0 && !hasFitted.current) {
            const bounds = L.latLngBounds(positions);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
            hasFitted.current = true;
        }
    }, [map, positions]);

    return null;
};

// --- Hook to detect current theme ---
const useTheme = () => {
    const [isDark, setIsDark] = useState(document.documentElement.getAttribute('data-theme') !== 'light');

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.getAttribute('data-theme') !== 'light');
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    return isDark;
};

// --- OSRM Route Fetcher ---
const fetchOSRMRoute = async (waypoints) => {
    // waypoints: array of [lat, lng]
    // OSRM expects lng,lat format
    const coordString = waypoints.map(([lat, lng]) => `${lng},${lat}`).join(';');
    const url = `${OSRM_BASE}/${coordString}?overview=full&geometries=geojson`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            // GeoJSON coordinates are [lng, lat], Leaflet needs [lat, lng]
            return data.routes[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
        }
    } catch (err) {
        console.warn('OSRM route fetch failed, falling back to straight lines:', err);
    }
    return null;
};

// --- Sequence Editor Sub-component ---
const SequenceEditor = ({ section, onUpdateSequence, onRemoveFromRoute, isAdmin }) => {
    if (!isAdmin) return null;
    const [seqValue, setSeqValue] = useState(section.test_sequence || '');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        await onUpdateSequence(section, seqValue);
        setSaving(false);
    };

    const handleRemove = async () => {
        setSaving(true);
        await onRemoveFromRoute(section);
        setSaving(false);
    };

    return (
        <div className="popup-sequence-editor">
            <div className="popup-seq-row">
                <Hash size={12} />
                <span className="popup-info-label">Sequence</span>
                <input
                    type="number"
                    className="popup-seq-input"
                    value={seqValue}
                    onChange={(e) => setSeqValue(e.target.value)}
                    placeholder="#"
                    min="1"
                />
                <button
                    className="popup-seq-save"
                    onClick={handleSave}
                    disabled={saving}
                    title="Save sequence"
                >
                    <Save size={12} />
                </button>
            </div>
            {section.test_sequence && (
                <button
                    className="popup-remove-route"
                    onClick={handleRemove}
                    disabled={saving}
                >
                    <Trash2 size={12} />
                    Remove from route
                </button>
            )}
        </div>
    );
};

// --- Main Component ---
const TripMapView = ({ sections, selectedSection, onSelectSection, onBack, onUpdateSection, onRemoveFromRoute, username, isAdmin }) => {
    const isDark = useTheme();
    const allTypes = useMemo(() => [...new Set(sections.map(s => s.type).filter(Boolean))], [sections]);
    const [routeGeometry, setRouteGeometry] = useState(null);
    const [routeLoading, setRouteLoading] = useState(false);

    // Days Plan State
    const [showDaysPlan, setShowDaysPlan] = useState(false);
    const [daysPlan, setDaysPlan] = useState([]); // [{ day: 1, sequences: [1, 2, 3] }]
    const [expandedDay, setExpandedDay] = useState(null);
    const [highlightedDays, setHighlightedDays] = useState(new Set()); // Set of day numbers
    const [showAllDays, setShowAllDays] = useState(false);

    // Load shared plan
    useEffect(() => {
        getSharedDaysPlan().then(plan => {
            if (plan && Array.isArray(plan)) {
                setDaysPlan(plan);
            }
        });
    }, []);

    // Save shared plan (debounced) - Admin Only
    useEffect(() => {
        if (isAdmin) {
            const timer = setTimeout(() => {
                if (daysPlan.length > 0) {
                    saveSharedDaysPlan(daysPlan);
                }
            }, 1000); // 1s debounce
            return () => clearTimeout(timer);
        }
    }, [daysPlan, isAdmin]);

    const handleAddDay = () => {
        const nextDay = daysPlan.length + 1;
        setDaysPlan([...daysPlan, { day: nextDay, sequences: [] }]);
        setExpandedDay(nextDay);
    };

    const handleRemoveDay = (dayNum) => {
        const newPlan = daysPlan.filter(d => d.day !== dayNum)
            .map((d, index) => ({ ...d, day: index + 1 })); // Re-index
        setDaysPlan(newPlan);
        if (expandedDay === dayNum) setExpandedDay(null);

        // Update highlighted days
        const newHighlighted = new Set();
        Array.from(highlightedDays).forEach(d => {
            if (d < dayNum) newHighlighted.add(d);
            if (d > dayNum) newHighlighted.add(d - 1);
        });
        setHighlightedDays(newHighlighted);
    };

    const toggleSequenceInDay = (dayNum, seq) => {
        if (!isAdmin) return;
        setDaysPlan(prev => prev.map(d => {
            if (d.day !== dayNum) return d;
            const newSeqs = d.sequences.includes(seq)
                ? d.sequences.filter(s => s !== seq)
                : [...d.sequences, seq].sort((a, b) => a - b);
            return { ...d, sequences: newSeqs };
        }));
    };

    const isSequenceAssigned = (seq) => {
        return daysPlan.some(d => d.sequences.includes(seq));
    };

    const getAssignedDay = (seq) => {
        return daysPlan.find(d => d.sequences.includes(seq));
    };

    const toggleDayHighlight = (dayNum) => {
        setHighlightedDays(prev => {
            const next = new Set(prev);
            if (next.has(dayNum)) next.delete(dayNum);
            else next.add(dayNum);

            // Sync showAllDays state if needed
            if (next.size === daysPlan.length && daysPlan.length > 0) setShowAllDays(true);
            else setShowAllDays(false);

            return next;
        });
    };

    const toggleShowAllDays = () => {
        if (showAllDays) {
            setHighlightedDays(new Set());
            setShowAllDays(false);
        } else {
            const all = new Set(daysPlan.map(d => d.day));
            setHighlightedDays(all);
            setShowAllDays(true);
        }
    };

    // Helper: Calculate distance in miles
    const calculateDistance = (coord1, coord2) => {
        const R = 3959; // Miles
        const dLat = (coord2[0] - coord1[0]) * Math.PI / 180;
        const dLon = (coord2[1] - coord1[1]) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(coord1[0] * Math.PI / 180) * Math.cos(coord2[0] * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const getEstimatedTime = (day) => {
        if (!day.sequences || day.sequences.length === 0) return "0m";

        // Get sections for this day
        const daySections = sections.filter(s =>
            day.sequences.includes(Number(s.test_sequence)) && s.coordinates
        ).sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence));

        if (daySections.length === 0) return "0m";

        let totalMiles = 0;
        for (let i = 0; i < daySections.length - 1; i++) {
            const c1 = parseCoords(daySections[i].coordinates);
            const c2 = parseCoords(daySections[i + 1].coordinates);
            if (c1 && c2) {
                totalMiles += calculateDistance(c1, c2);
            }
        }

        // Add 15 mins per stop + driving time (assume 50mph avg)
        const drivingMinutes = (totalMiles / 50) * 60;
        const stopMinutes = daySections.length * 15;
        const totalMinutes = Math.round(drivingMinutes + stopMinutes);

        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h}h ${m}m`;
    };

    // Parse sections with valid coordinates
    const mappableSections = useMemo(() => {
        return sections
            .map(s => ({ ...s, latLng: parseCoords(s.coordinates) }))
            .filter(s => s.latLng);
    }, [sections]);

    // Route: sections with test_sequence, sorted
    const orderedRouteSections = useMemo(() => {
        return mappableSections
            .filter(s => s.test_sequence && String(s.test_sequence).trim() !== '')
            .sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence));
    }, [mappableSections]);

    const routeWaypoints = useMemo(() => {
        if (orderedRouteSections.length === 0) return [];
        // Home → stops → Home
        return [HOME_POSITION, ...orderedRouteSections.map(s => s.latLng), HOME_POSITION];
    }, [orderedRouteSections]);

    // Fetch OSRM route when waypoints change
    useEffect(() => {
        if (routeWaypoints.length < 2) {
            setRouteGeometry(null);
            return;
        }

        let cancelled = false;
        setRouteLoading(true);

        fetchOSRMRoute(routeWaypoints).then(geometry => {
            if (!cancelled) {
                setRouteGeometry(geometry); // null means fallback to straight lines
                setRouteLoading(false);
            }
        });

        return () => { cancelled = true; };
    }, [routeWaypoints]);

    // Fallback straight-line positions
    const fallbackPositions = routeWaypoints;

    // All positions for fit-bounds (include home)
    const allPositions = useMemo(() => [HOME_POSITION, ...mappableSections.map(s => s.latLng)], [mappableSections]);

    // Selected section position
    const selectedPosition = useMemo(() => {
        if (!selectedSection) return null;
        return parseCoords(selectedSection.coordinates);
    }, [selectedSection]);

    // Stats
    const evaluated = mappableSections.filter(s => s.status === 'Evaluated').length;
    const total = mappableSections.length;

    // Sequence editing handlers
    const handleUpdateSequence = useCallback(async (section, newSeq) => {
        const updated = { ...section };
        delete updated.latLng; // Don't save computed field
        updated.test_sequence = newSeq ? String(newSeq) : '';
        await onUpdateSection(updated);
    }, [onUpdateSection]);

    const handleRemoveFromRoute = useCallback(async (section) => {
        if (onRemoveFromRoute) {
            await onRemoveFromRoute(section);
        } else {
            // Fallback: just clear sequence
            const updated = { ...section };
            delete updated.latLng;
            updated.test_sequence = '';
            await onUpdateSection(updated);
        }
    }, [onRemoveFromRoute, onUpdateSection]);

    // Get icon for section
    const getIcon = (section) => {
        const isSelected = selectedSection?.id === section.id;
        const seqNum = section.test_sequence && String(section.test_sequence).trim();
        const seqInt = seqNum ? parseInt(seqNum, 10) : null;

        // Check if this stops belongs to a highlighted day
        let dayColor = null;
        let dayBorder = null;

        if (seqInt) {
            const assignedDay = getAssignedDay(seqInt);
            if (assignedDay && highlightedDays.has(assignedDay.day)) {
                // Get color from palette based on day number
                const colorIdx = (assignedDay.day - 1) % CATEGORY_COLORS.length;
                dayColor = CATEGORY_COLORS[colorIdx];
                dayBorder = '#fff'; // White border for day-highlighted items to make them pop
            }
        }

        if (isSelected) {
            // Selected: use blue color but keep the sequence number if it has one
            if (seqNum) {
                return createSequenceIcon(seqNum, '#3b82f6', '#2563eb');
            }
            return selectedIcon;
        }

        // Highlighted Day overrides normal status colors
        if (dayColor && seqNum) {
            return createSequenceIcon(seqNum, dayColor, dayBorder);
        }

        // If section is on the route, show numbered marker
        if (seqNum) {
            const color = section.status === 'Evaluated' ? '#22c55e' : '#f59e0b';
            const border = section.status === 'Evaluated' ? '#16a34a' : '#d97706';
            return createSequenceIcon(seqNum, color, border);
        }

        return section.status === 'Evaluated' ? evaluatedIcon : pendingIcon;
    };

    // Component to handle map background clicks for deselection
    const MapClickHandler = () => {
        useMapEvents({
            click: () => {
                onSelectSection(null);
            },
        });
        return null;
    };

    return (
        <div className="trip-map-container">
            {/* Header Bar */}
            <div className="trip-map-header">
                <button onClick={onBack} className="trip-map-back-btn">
                    <ArrowLeft size={18} />
                    <span>Back</span>
                </button>
                <div className="trip-map-title">
                    <MapPin size={18} />
                    <span>Trip Map</span>
                    <span className="trip-map-stats">
                        {evaluated}/{total} evaluated
                        {orderedRouteSections.length > 0 && ` • ${orderedRouteSections.length} stops`}
                        {routeLoading && ' • Loading route...'}
                    </span>
                </div>
                <button
                    onClick={() => setShowDaysPlan(!showDaysPlan)}
                    className={`btn btn-ghost ${showDaysPlan ? 'bg-accent' : ''}`}
                    style={{ marginLeft: 'auto', gap: '8px' }}
                >
                    <Calendar size={18} />
                    <span className="hidden md:inline">Days Plan</span>
                </button>
            </div>

            {/* Days Plan Panel */}
            {showDaysPlan && (
                <div className="days-plan-panel">
                    <div className="days-plan-header">
                        <h3>Trip Itinerary</h3>
                        <button onClick={() => setShowDaysPlan(false)} className="btn-icon"><X size={16} /></button>
                    </div>

                    <div className="days-plan-content">
                        {daysPlan.length === 0 && (
                            <div className="text-muted text-center p-4 text-sm">
                                No days added yet. Click below to start planning!
                            </div>
                        )}

                        {daysPlan.map(day => (
                            <div key={day.day} className="day-card">
                                <div
                                    className="day-card-header"
                                    onClick={() => setExpandedDay(expandedDay === day.day ? null : day.day)}
                                >
                                    <div
                                        className="day-color-dot"
                                        style={{ background: CATEGORY_COLORS[(day.day - 1) % CATEGORY_COLORS.length] }}
                                    />
                                    <span className="font-bold flex-1">
                                        Day {day.day}
                                        <span className="text-xs font-normal text-muted ml-2">({getEstimatedTime(day)})</span>
                                    </span>

                                    <button
                                        className="btn-icon"
                                        onClick={(e) => { e.stopPropagation(); toggleDayHighlight(day.day); }}
                                        style={{ color: highlightedDays.has(day.day) ? CATEGORY_COLORS[(day.day - 1) % CATEGORY_COLORS.length] : 'inherit' }}
                                        title={highlightedDays.has(day.day) ? "Hide on map" : "Show on map"}
                                    >
                                        {highlightedDays.has(day.day) ? <Eye size={16} /> : <EyeOff size={16} />}
                                    </button>

                                    {/* Admin Only Remove */}
                                    {isAdmin && (
                                        <button
                                            className="btn-icon text-destructive hover:bg-destructive/10"
                                            onClick={(e) => { e.stopPropagation(); handleRemoveDay(day.day); }}
                                            title="Remove Day"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}

                                    {expandedDay === day.day ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>

                                {expandedDay === day.day && (
                                    <div className="day-card-body">
                                        <div className="text-xs text-muted mb-2">Assign stops to this day:</div>
                                        <div className="sequence-grid">
                                            {orderedRouteSections.length > 0 ? (
                                                orderedRouteSections.map(s => {
                                                    const seq = Number(s.test_sequence);
                                                    const isAssignedToThis = day.sequences.includes(seq);
                                                    const isAssignedToOther = !isAssignedToThis && isSequenceAssigned(seq);

                                                    return (
                                                        <button
                                                            key={s.id}
                                                            className={`sequence-cell ${isAssignedToThis ? 'selected' : ''} ${isAssignedToOther ? 'greyed' : ''}`}
                                                            onClick={() => toggleSequenceInDay(day.day, seq)}
                                                            disabled={(isAssignedToOther) || (!isAdmin)} // Disable if assigned elsewhere OR not admin
                                                            title={`Stop #${seq}: ${s.id}`}
                                                            style={isAssignedToThis ? {
                                                                background: CATEGORY_COLORS[(day.day - 1) % CATEGORY_COLORS.length],
                                                                color: '#fff',
                                                                borderColor: 'transparent',
                                                                cursor: isAdmin ? 'pointer' : 'default'
                                                            } : { cursor: (!isAssignedToOther && isAdmin) ? 'pointer' : 'default' }}
                                                        >
                                                            {seq}
                                                        </button>
                                                    );
                                                })
                                            ) : (
                                                <div className="col-span-full text-center text-xs text-muted">Thinking... No stops defined yet.</div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {isAdmin && (
                            <button onClick={handleAddDay} className="btn btn-outline w-full mt-4 gap-2">
                                <Plus size={16} /> Add Day {daysPlan.length + 1}
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Map */}
            <div className="trip-map-wrapper">
                <MapContainer
                    center={HOME_POSITION}
                    zoom={6}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={true}
                >
                    <TileLayer
                        key={isDark ? 'dark' : 'light'}
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url={isDark ? DARK_TILES : LIGHT_TILES}
                    />

                    <FitBounds positions={allPositions} selectedPosition={selectedPosition} />
                    <MapClickHandler />

                    {/* Home Marker */}
                    <Marker position={HOME_POSITION} icon={homeIcon} zIndexOffset={500}>
                        <Popup className="trip-map-popup">
                            <div className="popup-content">
                                <div className="popup-header">
                                    <span className="popup-section-id">Texas Tech University</span>
                                </div>
                                <div className="popup-location">
                                    <Home size={12} />
                                    Home Base — Lubbock, TX
                                </div>
                            </div>
                        </Popup>
                    </Marker>

                    {/* Route Polyline — real roads or fallback */}
                    {(routeGeometry || fallbackPositions.length > 1) && (
                        <Polyline
                            positions={routeGeometry || fallbackPositions}
                            pathOptions={{
                                color: '#6366f1',
                                weight: routeGeometry ? 4 : 3,
                                opacity: 0.8,
                                dashArray: routeGeometry ? null : '8, 6',
                            }}
                        />
                    )}

                    {/* Section Markers */}
                    {mappableSections.map(section => {
                        const isSelected = selectedSection?.id === section.id;
                        const icon = getIcon(section);

                        return (
                            <Marker
                                key={section.id}
                                position={section.latLng}
                                icon={icon}
                                zIndexOffset={isSelected ? 1000 : 0}
                                eventHandlers={{ click: () => onSelectSection(section) }}
                            >
                                <Popup className="trip-map-popup" maxWidth={300}>
                                    <div className="popup-content">
                                        <div className="popup-header">
                                            <span className="popup-section-id">{section.id}</span>
                                            <span
                                                className="popup-category-badge"
                                                style={{ background: getCategoryColor(section.type, allTypes) + '20', color: getCategoryColor(section.type, allTypes), borderColor: getCategoryColor(section.type, allTypes) + '40' }}
                                            >
                                                {section.type || 'Uncategorized'}
                                            </span>
                                        </div>
                                        <div className="popup-info-grid">
                                            {section.highway && (
                                                <div className="popup-info-row">
                                                    <Route size={12} />
                                                    <span className="popup-info-label">Highway</span>
                                                    <span className="popup-info-value">{section.highway}</span>
                                                </div>
                                            )}
                                            {section.district && (
                                                <div className="popup-info-row">
                                                    <Building2 size={12} />
                                                    <span className="popup-info-label">District</span>
                                                    <span className="popup-info-value">{section.district}</span>
                                                </div>
                                            )}
                                            <div className="popup-info-row">
                                                <Landmark size={12} />
                                                <span className="popup-info-label">County</span>
                                                <span className="popup-info-value">{section.county || 'Unknown'}</span>
                                            </div>
                                            <div className="popup-info-row">
                                                <MapPin size={12} />
                                                <span className="popup-info-label">City</span>
                                                <span className="popup-info-value">{section.city || 'Unknown'}</span>
                                            </div>
                                        </div>
                                        <div className="popup-meta">
                                            <span className={`popup-status ${section.status === 'Evaluated' ? 'evaluated' : 'pending'}`}>
                                                {section.status === 'Evaluated' ? <CheckCircle size={12} /> : <Clock size={12} />}
                                                {section.status || 'Not Evaluated'}
                                            </span>
                                            {section.test_sequence && (
                                                <span className="popup-sequence">
                                                    <Navigation size={12} />
                                                    Stop #{section.test_sequence}
                                                </span>
                                            )}
                                        </div>

                                        {/* Sequence Editor - Admin Only */}
                                        <SequenceEditor
                                            section={section}
                                            onUpdateSequence={handleUpdateSequence}
                                            onRemoveFromRoute={handleRemoveFromRoute}
                                            isAdmin={isAdmin}
                                        />

                                        {section.coordinates && (
                                            <div className="popup-coords">{section.coordinates}</div>
                                        )}
                                        <div className="popup-actions">
                                            <button
                                                className="popup-view-btn"
                                                onClick={() => {
                                                    onSelectSection(section);
                                                    onBack();
                                                }}
                                            >
                                                View Details →
                                            </button>
                                            {section.coordinates && (
                                                <a
                                                    className="popup-gmaps-link"
                                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(section.coordinates)}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                >
                                                    <ExternalLink size={12} />
                                                    Google Maps
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>

                {/* Legend */}
                <div className="trip-map-legend">
                    <div className="legend-title">Legend</div>
                    <div className="legend-item">
                        <span className="legend-dot" style={{ background: '#22c55e', boxShadow: '0 0 4px #22c55e88' }}></span>
                        <span>Evaluated</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot" style={{ background: '#f59e0b', boxShadow: '0 0 4px #f59e0b88' }}></span>
                        <span>Not Evaluated</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot" style={{ background: '#3b82f6', boxShadow: '0 0 4px #3b82f688' }}></span>
                        <span>Selected</span>
                    </div>
                    <div className="legend-item">
                        <span style={{ fontSize: '14px', lineHeight: 1 }}>🏠</span>
                        <span>Home (Texas Tech)</span>
                    </div>
                    {routeGeometry && (
                        <div className="legend-item">
                            <span className="legend-line legend-line-solid"></span>
                            <span>Route (road)</span>
                        </div>
                    )}
                    {!routeGeometry && fallbackPositions.length > 1 && (
                        <div className="legend-item">
                            <span className="legend-line"></span>
                            <span>Route (approx)</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TripMapView;
