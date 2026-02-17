import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft, MapPin, Navigation, CheckCircle, Clock, ExternalLink, Building2, Route, Home, Hash, Trash2, Save, Landmark } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

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
const SequenceEditor = ({ section, onUpdateSequence, onRemoveFromRoute }) => {
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
const TripMapView = ({ sections, selectedSection, onSelectSection, onBack, onUpdateSection, onRemoveFromRoute }) => {
    const isDark = useTheme();
    const allTypes = useMemo(() => [...new Set(sections.map(s => s.type).filter(Boolean))], [sections]);
    const [routeGeometry, setRouteGeometry] = useState(null);
    const [routeLoading, setRouteLoading] = useState(false);

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
        if (isSelected) return selectedIcon;

        // If section is on the route, show numbered marker
        const seqNum = section.test_sequence && String(section.test_sequence).trim();
        if (seqNum) {
            const color = section.status === 'Evaluated' ? '#22c55e' : '#f59e0b';
            const border = section.status === 'Evaluated' ? '#16a34a' : '#d97706';
            return createSequenceIcon(seqNum, color, border);
        }

        return section.status === 'Evaluated' ? evaluatedIcon : pendingIcon;
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
            </div>

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

                                        {/* Sequence Editor */}
                                        <SequenceEditor
                                            section={section}
                                            onUpdateSequence={handleUpdateSequence}
                                            onRemoveFromRoute={handleRemoveFromRoute}
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
