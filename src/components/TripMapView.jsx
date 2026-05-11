import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { ArrowLeft, MapPin, Navigation, CheckCircle, Clock, ExternalLink, Building2, Route, Home, Hash, Trash2, Save, Landmark, Calendar, Plus, X, ChevronDown, ChevronUp, Eye, EyeOff, Printer, Download, FileSpreadsheet, Zap, RotateCcw, ListOrdered, ArrowDown, Check, Flag, Edit2, Menu } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import 'leaflet/dist/leaflet.css';
import { saveSharedDaysPlan, getSharedDaysPlan, updateProject } from '../db';
import { exportToExcel } from '../utils/exportUtils';
import { useNotification } from '../context/NotificationContext';

// --- Constants ---
const DEFAULT_HOME_POSITION = [33.58703457593024, -101.87436165377096];
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const LIGHT_TILES = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

const startIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div class="sequence-marker" style="
        background: #22c55e;
        border: 2px solid #16a34a;
        box-shadow: 0 0 8px #22c55eaa, 0 2px 6px rgba(0,0,0,0.4);
    ">A</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -16],
});

const endIcon = L.divIcon({
    className: 'custom-map-marker',
    html: `<div class="sequence-marker" style="
        background: #ef4444;
        border: 2px solid #dc2626;
        box-shadow: 0 0 8px #ef4444aa, 0 2px 6px rgba(0,0,0,0.4);
    ">B</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -16],
});

const evaluatedIcon = createMarkerIcon('#22c55e', '#911f13ff');
const pendingIcon = createMarkerIcon('#f59e0b', '#d97706');
const selectedIcon = createMarkerIcon('#3b82f6', '#2563eb');

// --- Category Color Palette ---
const CATEGORY_COLORS = [
    '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#d54545ff',
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
    const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'light');

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setTheme(document.documentElement.getAttribute('data-theme') || 'dark');
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        return () => observer.disconnect();
    }, []);

    return theme;
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

// --- OSRM Route Fetcher (geometry only, chunked) ---
const fetchOSRMRoute = async (waypoints) => {
    const result = await fetchOSRMRouteWithDuration(waypoints);
    return result ? result.geometry : null;
};

// --- OSRM Route Fetcher with Duration ---
const fetchOSRMRouteWithDuration = async (waypoints) => {
    // waypoints: array of [lat, lng]
    if (!waypoints || waypoints.length < 2) return null;

    // Helper for single chunk fetch — returns { geometry, durationSeconds }
    const fetchChunk = async (chunk, retries = 3) => {
        // OSRM expects lng,lat format
        const coordString = chunk.map(([lat, lng]) => `${lng},${lat}`).join(';');
        const url = `${OSRM_BASE}/${coordString}?overview=full&geometries=geojson`;

        for (let attempt = 0; attempt < retries; attempt++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

            try {
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    throw new Error(`OSRM HTTP error: ${res.status}`);
                }

                const data = await res.json();
                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    return {
                        geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
                        durationSeconds: route.duration,
                    };
                }
                throw new Error(`OSRM error code: ${data.code}`);
            } catch (err) {
                clearTimeout(timeoutId);
                console.warn(`OSRM chunk fetch attempt ${attempt + 1} failed:`, err.message);
                if (attempt < retries - 1) {
                    await sleep(500 * (attempt + 1)); // Backoff
                }
            }
        }
        return null;
    };

    // If small enough, fetch directly
    if (waypoints.length <= 15) {
        return await fetchChunk(waypoints);
    }

    // Otherwise, chunk it
    const chunkSize = 15;
    const geometry = [];
    let totalDurationSeconds = 0;

    for (let i = 0; i < waypoints.length - 1; i += (chunkSize - 1)) {
        const chunk = waypoints.slice(i, i + chunkSize);
        if (chunk.length < 2) break;

        await sleep(200); // Rate limiting protection
        const chunkResult = await fetchChunk(chunk);

        if (chunkResult) {
            totalDurationSeconds += chunkResult.durationSeconds;
            if (geometry.length > 0) {
                geometry.push(...chunkResult.geometry.slice(1));
            } else {
                geometry.push(...chunkResult.geometry);
            }
        } else {
            // Fallback for this segment
            const straightLine = chunk;
            if (geometry.length > 0) {
                geometry.push(...straightLine.slice(1));
            } else {
                geometry.push(...straightLine);
            }
        }
    }

    return geometry.length > 0 ? { geometry, durationSeconds: totalDurationSeconds } : null;
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

// --- Location Marker Component ---
const LocationMarker = () => {
    const [position, setPosition] = useState(null);
    const [bbox, setBbox] = useState([]);
    const map = useMapEvents({
        locationfound(e) {
            setPosition(e.latlng);
            console.log("Location found:", e.latlng);
            // Optionally fly to location once on first load
            // map.flyTo(e.latlng, map.getZoom());
        },
        locationerror(e) {
            console.warn("Location access denied or failed:", e.message);
        }
    });

    useEffect(() => {
        map.locate({ watch: true, enableHighAccuracy: true });
    }, [map]);

    const currentLocationIcon = L.divIcon({
        className: 'current-location-marker-container',
        html: `<div class="current-location-marker"></div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10],
    });

    const handleLocateMe = (e) => {
        e.stopPropagation(); // Prevent map click
        if (position) {
            map.flyTo(position, 16);
        } else {
            // Try to locate without forcing persistent setView
            // The existing watcher will pick it up
            map.locate({ enableHighAccuracy: true });
        }
    };

    return (
        <>
            {position && (
                <Marker position={position} icon={currentLocationIcon} zIndexOffset={1000}>
                    <Popup>You are here</Popup>
                </Marker>
            )}
            <div className="leaflet-bottom leaflet-right" style={{ pointerEvents: 'none' }}>
                <div className="leaflet-control leaflet-bar" style={{ pointerEvents: 'auto', marginBottom: '80px', marginRight: '10px' }}>
                    <a
                        href="#"
                        role="button"
                        title="Show my location"
                        onClick={(e) => {
                            e.preventDefault();
                            handleLocateMe(e);
                        }}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '34px',
                            height: '34px',
                            background: 'hsl(var(--card))',
                            color: 'hsl(var(--foreground))',
                            border: '1px solid hsl(var(--border) / 0.5)'
                        }}
                    >
                        <Navigation size={18} style={{ fill: position ? '#3b82f6' : 'none' }} />
                    </a>
                </div>
            </div>
        </>
    );
};

// --- Main Component ---
const TripMapView = ({ sections, selectedSection, onSelectSection, onBack, onUpdateSection, onUpdateSections, onRemoveFromRoute, username, isAdmin, projectId, project, onUpdateProject }) => {
    const theme = useTheme();
    const { showAlert, showConfirm } = useNotification();
    // Use dark tiles for 'dark' and 'medium' themes
    const isDarkTiles = theme === 'dark' || theme === 'medium';
    const allTypes = useMemo(() => [...new Set(sections.map(s => s.type).filter(Boolean))], [sections]);
    const [routeGeometry, setRouteGeometry] = useState(null);

    const [routeLoading, setRouteLoading] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Start & End Location State
    const [startPosition, setStartPosition] = useState(DEFAULT_HOME_POSITION);
    const [startName, setStartName] = useState('Texas Tech');
    const [isEditingStart, setIsEditingStart] = useState(false);

    const [endPosition, setEndPosition] = useState(DEFAULT_HOME_POSITION);
    const [endName, setEndName] = useState('Texas Tech');
    const [isEditingEnd, setIsEditingEnd] = useState(false);

    // Derived Locations from Project
    useEffect(() => {
        if (project) {
            // Start Location
            const sLoc = project.startLocation || project.homeLocation;
            if (sLoc) {
                const coords = parseCoords(sLoc.coordinates);
                if (coords) setStartPosition(coords);
                if (sLoc.name) setStartName(sLoc.name);
            } else {
                setStartPosition(DEFAULT_HOME_POSITION);
                setStartName('Texas Tech');
            }

            // End Location
            const eLoc = project.endLocation || project.homeLocation;
            if (eLoc) {
                const coords = parseCoords(eLoc.coordinates);
                if (coords) setEndPosition(coords);
                if (eLoc.name) setEndName(eLoc.name);
            } else {
                setEndPosition(DEFAULT_HOME_POSITION);
                setEndName('Texas Tech');
            }
        }
    }, [project]);

    // Edit Start/End Form State
    const [editLocName, setEditLocName] = useState('');
    const [editLocCoords, setEditLocCoords] = useState('');
    const [savingLoc, setSavingLoc] = useState(false);

    const openEditStart = () => {
        if (!isAdmin) return;
        setEditLocName(startName);
        setEditLocCoords(startPosition.join(', '));
        setIsEditingStart(true);
    };

    const openEditEnd = () => {
        if (!isAdmin) return;
        setEditLocName(endName);
        setEditLocCoords(endPosition.join(', '));
        setIsEditingEnd(true);
    };

    const handleSaveLocation = async (type) => {
        if (!isAdmin || !projectId) return;
        const coords = parseCoords(editLocCoords);
        if (!coords) {
            showAlert("Invalid coordinates format. Use: lat, lng");
            return;
        }

        setSavingLoc(true);
        try {
            const updateField = type === 'start' ? 'startLocation' : 'endLocation';
            await updateProject(projectId, {
                [updateField]: {
                    name: editLocName,
                    coordinates: editLocCoords
                }
            }, username);
            if (onUpdateProject) onUpdateProject();
            if (type === 'start') setIsEditingStart(false);
            else setIsEditingEnd(false);
        } catch (e) {
            console.error("Error saving location:", e);
            showAlert("Failed to save location.");
        } finally {
            setSavingLoc(false);
        }
    };

    const handleUseMyLocation = () => {
        navigator.geolocation.getCurrentPosition(pos => {
            const coords = `${pos.coords.latitude}, ${pos.coords.longitude}`;
            setEditLocCoords(coords);
        }, err => {
            console.error(err);
            showAlert("Could not get location.");
        });
    };

    // Days Plan State
    const [showDaysPlan, setShowDaysPlan] = useState(false);
    const [daysPlan, setDaysPlan] = useState([]); // [{ day: 1, sequences: [1, 2, 3] }]
    const [minutesPerStop, setMinutesPerStop] = useState(project?.minutesPerStop || 15); // Draft input value
    const [appliedMinutesPerStop, setAppliedMinutesPerStop] = useState(project?.minutesPerStop || 15); // Applied value used in calculations
    const [justApplied, setJustApplied] = useState(false); // Visual feedback flag

    useEffect(() => {
        if (project?.minutesPerStop) {
            setMinutesPerStop(project.minutesPerStop);
            setAppliedMinutesPerStop(project.minutesPerStop);
        }
    }, [project?.minutesPerStop]);

    const handleApplyMinutes = async () => {
        setAppliedMinutesPerStop(minutesPerStop);
        setJustApplied(true);
        setTimeout(() => setJustApplied(false), 2000);
        if (isAdmin && projectId) {
            try {
                await updateProject(projectId, { minutesPerStop }, username);
                if (onUpdateProject) onUpdateProject();
            } catch(e) {
                console.error("Error saving minutesPerStop:", e);
            }
        }
    };
    const [expandedDay, setExpandedDay] = useState(null);
    const [highlightedDays, setHighlightedDays] = useState(new Set()); // Set of day numbers
    const [showAllDays, setShowAllDays] = useState(false);
    const [dayRoutes, setDayRoutes] = useState({}); // { dayNum: coordinates[] }
    const [dayDriveMinutes, setDayDriveMinutes] = useState({}); // { dayNum: driveMinutes } from OSRM
    const [dayRouteErrors, setDayRouteErrors] = useState({}); // { dayNum: boolean }
    const [optimizingDay, setOptimizingDay] = useState(null);
    const [isGlobalOptimizing, setIsGlobalOptimizing] = useState(false);
    const [showMobileMenu, setShowMobileMenu] = useState(false);
    const [isMobileScreen, setIsMobileScreen] = useState(window.innerWidth <= 768);

    useEffect(() => {
        const handleResize = () => setIsMobileScreen(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // In-memory snapshot for undo — stores { daysPlan, sections } before last optimize
    const optimizeSnapshot = useRef(null);
    const [hasOptimizeSnapshot, setHasOptimizeSnapshot] = useState(false);

    // Routing Cache and Locks
    const routingCache = useRef(new Map()); // dayNum (or 'main') -> stringifiedWaypoints
    const isRoutingBusy = useRef(false);

    const handleGlobalOptimize = async () => {
        if (!isAdmin || !onUpdateSections) return;

        if (!await showConfirm("Global Optimization will reorganize ALL stops across ALL days to balance travel time. Proceed?")) {
            return;
        }

        setIsGlobalOptimizing(true);
        try {
            // 1. Gather ALL sections that are part of the route (have a test_sequence number)
            // This intentionally includes sections NOT yet assigned to any specific day,
            // so the optimization can distribute them all evenly across all days.
            const allAssignedSections = sections
                .filter(s => s.test_sequence && String(s.test_sequence).trim() !== '')
                .sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence));

            if (allAssignedSections.length === 0) {
                showAlert("No stops assigned to any days.");
                return;
            }

            // 2. Save in-memory snapshot of current state for undo
            optimizeSnapshot.current = {
                daysPlan: daysPlan.map(d => ({ ...d, sequences: [...d.sequences] })),
                sections: allAssignedSections.map(s => ({ docId: s.docId, test_sequence: s.test_sequence }))
            };
            setHasOptimizeSnapshot(true);

            // 3. Grand Tour (Nearest Neighbor) — sort all sections into optimal travel order
            let unvisited = [...allAssignedSections];
            let currentPos = startPosition;
            const grandTour = [];

            while (unvisited.length > 0) {
                let closestIdx = -1;
                let minDist = Infinity;

                for (let i = 0; i < unvisited.length; i++) {
                    const coords = parseCoords(unvisited[i].coordinates);
                    if (!coords) continue;
                    const d = calculateDistance(currentPos, coords);
                    if (d < minDist) {
                        minDist = d;
                        closestIdx = i;
                    }
                }

                if (closestIdx !== -1) {
                    const next = unvisited[closestIdx];
                    grandTour.push(next);
                    unvisited.splice(closestIdx, 1);
                    const nextCoords = parseCoords(next.coordinates);
                    if (nextCoords) currentPos = nextCoords;
                } else {
                    grandTour.push(...unvisited);
                    break;
                }
            }

            // 4. Calculate per-section travel weight (drive time + stop time in minutes)
            const getSectionWeight = (sec, prevCoord) => {
                const coords = parseCoords(sec.coordinates);
                if (!coords || !prevCoord) return appliedMinutesPerStop;
                const miles = calculateDistance(prevCoord, coords);
                const driveMin = (miles * 1.2 / 65) * 60;
                return driveMin + appliedMinutesPerStop;
            };

            let tempPos = startPosition;
            const secWeights = grandTour.map(sec => {
                const w = getSectionWeight(sec, tempPos);
                const coords = parseCoords(sec.coordinates);
                if (coords) tempPos = coords;
                return w;
            });

            const totalWeight = secWeights.reduce((sum, w) => sum + w, 0);
            const numDays = daysPlan.length;
            const targetWeightPerDay = totalWeight / numDays;

            // 5. Partition: assign sections to days evenly by cumulative weight
            const newDaysPlan = daysPlan.map(d => ({ ...d, sequences: [] }));
            let currentDayIdx = 0;
            let cumulativeWeight = 0;

            grandTour.forEach((sec, idx) => {
                // Advance to next day if we've filled this one, but always leave at least 1 stop per day
                while (
                    currentDayIdx < numDays - 1 &&
                    newDaysPlan[currentDayIdx].sequences.length > 0 &&
                    cumulativeWeight + (secWeights[idx] / 2) > (currentDayIdx + 1) * targetWeightPerDay
                ) {
                    currentDayIdx++;
                }

                const newSeq = idx + 1; // Simple sequential numbering: 1, 2, 3...
                newDaysPlan[currentDayIdx].sequences.push(newSeq);
                cumulativeWeight += secWeights[idx];
            });

            // 6. Build section updates — assign new sequential numbers to sections in grandTour order
            const sectionUpdates = grandTour.map((sec, idx) => ({
                ...sec,
                test_sequence: String(idx + 1),
            }));

            // 7. Apply
            await onUpdateSections(sectionUpdates);
            setDaysPlan(newDaysPlan);
            // Force save immediately (don't rely on debounce)
            await saveSharedDaysPlan(projectId, newDaysPlan);

        } catch (error) {
            console.error("Global Optimize failed:", error);
            showAlert(`Global Optimization failed: ${error.message}`);
        } finally {
            setIsGlobalOptimizing(false);
        }
    };

    const handleGlobalRevert = async () => {
        if (!isAdmin || !onUpdateSections) return;
        if (!optimizeSnapshot.current) {
            showAlert("Nothing to undo — no optimization has been run yet.");
            return;
        }
        if (!await showConfirm("Undo the last Global Optimization? This will restore the previous arrangement.")) return;

        setIsGlobalOptimizing(true);
        try {
            const { daysPlan: prevDaysPlan, sections: prevSections } = optimizeSnapshot.current;

            // Restore section sequences from snapshot
            const sectionUpdates = prevSections.map(snap => {
                const fullSection = sections.find(s => s.docId === snap.docId);
                if (!fullSection) return null;
                return { ...fullSection, test_sequence: snap.test_sequence };
            }).filter(Boolean);

            await onUpdateSections(sectionUpdates);
            setDaysPlan(prevDaysPlan);

            // Clear snapshot so you can't undo twice
            optimizeSnapshot.current = null;
            setHasOptimizeSnapshot(false);

        } catch (error) {
            console.error("Global Revert failed:", error);
            showAlert(`Undo failed: ${error.message}`);
        } finally {
            setIsGlobalOptimizing(false);
        }
    };

    const handleOptimizeDay = async (dayNum) => {
        if (!isAdmin || !onUpdateSections) return;
        setOptimizingDay(dayNum);

        try {
            const dayData = daysPlan.find(d => d.day === dayNum);
            if (!dayData) return;

            // Derive sections for this day
            const daySections = sections.filter(s =>
                dayData.sequences.includes(Number(s.test_sequence))
            ).sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence));

            if (daySections.length === 0) return;

            const sectionsToOptimize = [...daySections];

            // Determine start position
            let currentPos = startPosition;
            if (dayNum > 1) {
                const prevDay = daysPlan.find(d => d.day === dayNum - 1);
                if (prevDay && prevDay.sequences && prevDay.sequences.length > 0) {
                    // Get sections for prev day to find last coord
                    const prevDaySections = sections.filter(s =>
                        prevDay.sequences.includes(Number(s.test_sequence))
                    ).sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence));

                    if (prevDaySections.length > 0) {
                        const lastSection = prevDaySections[prevDaySections.length - 1];
                        const coords = parseCoords(lastSection.coordinates);
                        if (coords) currentPos = coords;
                    }
                }
            }

            // Greedy Nearest Neighbor Sort
            let sorted = [];
            let unvisited = [...sectionsToOptimize];

            while (unvisited.length > 0) {
                let closestIdx = -1;
                let minDist = Infinity;

                for (let i = 0; i < unvisited.length; i++) {
                    const coords = parseCoords(unvisited[i].coordinates);
                    if (!coords) continue;
                    // calculateDistance expects [lat, lng] arrays
                    const d = calculateDistance(currentPos, coords);
                    if (d < minDist) {
                        minDist = d;
                        closestIdx = i;
                    }
                }

                if (closestIdx !== -1) {
                    const next = unvisited[closestIdx];
                    sorted.push(next);
                    unvisited.splice(closestIdx, 1);
                    const nextCoords = parseCoords(next.coordinates);
                    if (nextCoords) currentPos = nextCoords;
                } else {
                    // If remaining items have invalid coords, just append them
                    sorted.push(...unvisited);
                    break;
                }
            }

            // Assign new sequence numbers based on existing set
            const sequenceNums = sectionsToOptimize.map(s => Number(s.test_sequence)).sort((a, b) => a - b);
            const updates = sorted.map((s, idx) => {
                return {
                    ...s,
                    test_sequence: String(sequenceNums[idx]),
                    original_sequence: s.test_sequence // Always snapshot the state right before THIS optimization
                };
            });

            await onUpdateSections(updates);

        } catch (error) {
            console.error("Optimization failed:", error);
            showAlert(`Failed to optimize route: ${error.message}`);
        } finally {
            setOptimizingDay(null);
        }
    };

    const handleRevertDay = async (dayNum) => {
        if (!isAdmin || !onUpdateSections) return;
        setOptimizingDay(dayNum);
        try {
            const dayData = daysPlan.find(d => d.day === dayNum);
            if (!dayData) return;

            // Derive sections for this day
            const daySections = sections.filter(s =>
                dayData.sequences.includes(Number(s.test_sequence))
            );

            const updates = [];
            daySections.forEach(s => {
                if (s.original_sequence) {
                    updates.push({
                        ...s,
                        test_sequence: s.original_sequence,
                        original_sequence: null // This will be cleaned up by Firestore if merged, or set to null
                    });
                }
            });

            if (updates.length > 0) {
                await onUpdateSections(updates);
            }
        } catch (error) {
            console.error("Revert failed:", error);
        } finally {
            setOptimizingDay(null);
        }
    };

    const handleDateChange = (dayNum, newDate) => {
        setDaysPlan(prev => {
            const newPlan = prev.map(d => {
                if (d.day === dayNum) return { ...d, date: newDate };
                return d;
            });
            // Force immediate save for date changes so they aren't lost on quick refresh
            if (isAdmin && projectId) {
                saveSharedDaysPlan(projectId, newPlan).catch(console.error);
            }
            return newPlan;
        });
    };

    const [isLegendOpen, setIsLegendOpen] = useState(true); // Default open on desktop, will override with CSS for mobile if needed, or check width

    const [isPlanLoaded, setIsPlanLoaded] = useState(false);

    // Load shared plan
    useEffect(() => {
        if (projectId) {
            setIsPlanLoaded(false); // Reset on project change
            getSharedDaysPlan(projectId).then(plan => {
                if (plan && Array.isArray(plan)) {
                    setDaysPlan(plan);
                } else {
                    setDaysPlan([]); // Reset if no plan found (fixes switching projects issue)
                }
                setIsPlanLoaded(true);
            });
        }
    }, [projectId]);

    // Save shared plan - Admin Only
    // This is run whenever daysPlan changes (e.g. from drag/drop sequence changes).
    useEffect(() => {
        if (isAdmin && projectId && isPlanLoaded && daysPlan !== undefined) {
            const timer = setTimeout(() => {
                saveSharedDaysPlan(projectId, daysPlan).catch(console.error);
            }, 500); // reduced debounce
            return () => clearTimeout(timer);
        }
    }, [daysPlan, isAdmin, projectId, isPlanLoaded]);

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

    // Helper: Calculate distance in miles - MOVED TO MODULE SCOPE
    // const calculateDistance = ...

    // Calculate stats for all days (distance, time, start/end locations)
    // Uses real OSRM drive durations when available (stored in dayDriveMinutes),
    // falls back to haversine estimate while OSRM is still loading.
    const dayStats = useMemo(() => {
        const stats = {};
        const sortedDays = [...daysPlan].sort((a, b) => a.day - b.day);
        let currentLocation = startPosition;

        sortedDays.forEach(day => {
            const daySections = sections.filter(s =>
                day.sequences.includes(Number(s.test_sequence)) && s.coordinates
            ).sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence));

            let totalMiles = 0;
            let totalTime = 0;
            let drivingMinutes = 0;
            let stopMinutes = 0;

            if (daySections.length > 0) {
                const dayMappable = daySections
                    .map(s => parseCoords(s.coordinates))
                    .filter(c => c);

                // Use real OSRM duration if available
                const realDriveMinutes = dayDriveMinutes[day.day];

                if (realDriveMinutes != null) {
                    // OSRM gave us actual road time — just add stop time
                    drivingMinutes = realDriveMinutes;
                    stopMinutes = daySections.length * appliedMinutesPerStop;
                    totalTime = Math.round(drivingMinutes + stopMinutes);

                    // Still compute straight-line miles for display
                    if (dayMappable.length > 0) {
                        totalMiles += calculateDistance(currentLocation, dayMappable[0]);
                    }
                    for (let i = 0; i < dayMappable.length - 1; i++) {
                        totalMiles += calculateDistance(dayMappable[i], dayMappable[i + 1]);
                    }
                    if (day.day === sortedDays[sortedDays.length - 1].day && dayMappable.length > 0) {
                        totalMiles += calculateDistance(dayMappable[dayMappable.length - 1], endPosition);
                    }
                } else {
                    // Fallback estimate - REMOVED per user request
                    // Just calculate miles for display, validation logic remains
                    if (dayMappable.length > 0) {
                        totalMiles += calculateDistance(currentLocation, dayMappable[0]);
                    }
                    for (let i = 0; i < dayMappable.length - 1; i++) {
                        totalMiles += calculateDistance(dayMappable[i], dayMappable[i + 1]);
                    }
                    if (day.day === sortedDays[sortedDays.length - 1].day && dayMappable.length > 0) {
                        totalMiles += calculateDistance(dayMappable[dayMappable.length - 1], endPosition);
                    }
                    // drivingMinutes = (totalMiles * 1.2 / 65) * 60;
                    // stopMinutes = daySections.length * 15;
                    // totalTime = Math.round(drivingMinutes + stopMinutes);

                    // Mark as loading heavily
                    drivingMinutes = null;
                    stopMinutes = daySections.length * appliedMinutesPerStop;
                    totalTime = 0;
                }

                // Advance current location to last stop of this day
                if (dayMappable.length > 0) {
                    currentLocation = dayMappable[dayMappable.length - 1];
                }
            }

            const h = Math.floor(totalTime / 60);
            const m = totalTime % 60;

            // Breakdown stats
            const driveH = Math.floor(Math.round(drivingMinutes) / 60);
            const driveM = Math.round(drivingMinutes) % 60;
            const stopH = Math.floor(stopMinutes / 60);
            const stopM = stopMinutes % 60;

            stats[day.day] = {
                miles: totalMiles.toFixed(1),
                timeStr: dayRouteErrors[day.day] ? "Road route failed" : (drivingMinutes === null ? "Calculating..." : `${h}h ${m}m`),
                driveStr: dayRouteErrors[day.day] ? "N/A" : (drivingMinutes === null ? "..." : `${driveH}h ${driveM}m`),
                stopStr: `${stopH}h ${stopM}m`,
                totalMinutes: totalTime,
                isLoading: (drivingMinutes === null) && !dayRouteErrors[day.day],
                isError: !!dayRouteErrors[day.day]
            };
        });

        return stats;
    }, [daysPlan, sections, startPosition, endPosition, dayDriveMinutes, dayRouteErrors, appliedMinutesPerStop]);

    const getEstimatedTime = (day) => {
        return dayStats[day.day]?.timeStr || "0h 0m";
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

    // Sequence Manager State
    const [showSequenceManager, setShowSequenceManager] = useState(false);
    const [sequenceList, setSequenceList] = useState([]); // Array of sections for reordering
    const [isSavingSequence, setIsSavingSequence] = useState(false);
    const [draggedItemIndex, setDraggedItemIndex] = useState(null);

    // Initialize sequence list when opening panel
    useEffect(() => {
        if (showSequenceManager) {
            setSequenceList([...orderedRouteSections]);
        }
    }, [showSequenceManager, orderedRouteSections]);

    const handleFixDown = (index) => {
        const newList = [...sequenceList];
        const startSeq = Number(newList[index].test_sequence);
        if (isNaN(startSeq)) return;

        for (let i = index + 1; i < newList.length; i++) {
            newList[i] = { ...newList[i], test_sequence: String(startSeq + (i - index)) };
        }
        setSequenceList(newList);
    };

    const handleSaveSequence = async () => {
        if (!isAdmin || !onUpdateSections) return;
        setIsSavingSequence(true);
        try {
            // Find which sections actually changed
            const updates = [];
            sequenceList.forEach((sec) => {
                const original = sections.find(s => s.docId === sec.docId);
                if (original && original.test_sequence !== sec.test_sequence) {
                    const update = { ...sec };
                    delete update.latLng; // Cleanup
                    updates.push(update);
                }
            });

            if (updates.length > 0) {
                await onUpdateSections(updates);
            }
            setShowSequenceManager(false);
        } catch (err) {
            console.error("Failed to save sequence:", err);
            showAlert("Error saving sequence changes.");
        } finally {
            setIsSavingSequence(false);
        }
    };

    // Drag and Drop Logic
    const onDragStart = (e, index) => {
        setDraggedItemIndex(index);
        e.dataTransfer.effectAllowed = "move";
    };
    const onDragOver = (e, index) => {
        e.preventDefault();
        if (draggedItemIndex === null || draggedItemIndex === index) return;

        const newList = [...sequenceList];
        const item = newList.splice(draggedItemIndex, 1)[0];
        newList.splice(index, 0, item);

        setDraggedItemIndex(index);
        setSequenceList(newList);
    };

    const handleRenumberAll = () => {
        const resequenced = sequenceList.map((it, idx) => ({
            ...it,
            test_sequence: String(idx + 1)
        }));
        setSequenceList(resequenced);
    };

    const onDragEnd = () => {
        setDraggedItemIndex(null);
    };

    const routeWaypoints = useMemo(() => {
        if (orderedRouteSections.length === 0) return [];
        // Start → stops → End
        return [startPosition, ...orderedRouteSections.map(s => s.latLng), endPosition];
    }, [orderedRouteSections, startPosition, endPosition]);

    // Fetch OSRM route when waypoints change
    useEffect(() => {
        const waypointsKey = JSON.stringify(routeWaypoints);
        if (routeWaypoints.length < 2) {
            setRouteGeometry(null);
            routingCache.current.set('main', waypointsKey);
            return;
        }

        // Deduplication: Only fetch if waypoints actually changed
        if (routingCache.current.get('main') === waypointsKey) {
            return;
        }

        let cancelled = false;
        setRouteLoading(true);

        fetchOSRMRoute(routeWaypoints).then(geometry => {
            if (!cancelled) {
                setRouteGeometry(geometry);
                setRouteLoading(false);
                routingCache.current.set('main', waypointsKey);
            }
        });

        return () => { cancelled = true; };
    }, [routeWaypoints]);

    // Fetch routes for each day (geometry + real OSRM drive durations)
    useEffect(() => {
        let cancelled = false;

        const fetchDayRoutes = async () => {
            // Lock to prevent concurrent multi-fetch operations
            if (isRoutingBusy.current) return;
            isRoutingBusy.current = true;

            try {
                const newDayRoutes = { ...dayRoutes };
                const newDayDriveMinutes = { ...dayDriveMinutes };
                const newDayErrors = { ...dayRouteErrors };
                let modified = false;

                // Sort days to ensure sequence
                const sortedDays = [...daysPlan].sort((a, b) => a.day - b.day);

                // Track where the previous day ended
                let lastLocation = startPosition;

                for (const day of sortedDays) {
                    if (cancelled) break;

                    // Get sections for this day
                    const daySections = sections.filter(s =>
                        day.sequences.includes(Number(s.test_sequence)) && s.coordinates
                    ).sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence));

                    const dayMappable = daySections
                        .map(s => ({ ...s, latLng: parseCoords(s.coordinates) }))
                        .filter(s => s.latLng);

                    // Waypoints: Previous End -> Stops
                    const waypoints = [lastLocation, ...dayMappable.map(s => s.latLng)];

                    // Update lastLocation for the next day's starting point even if we don't fetch
                    if (dayMappable.length > 0) {
                        lastLocation = dayMappable[dayMappable.length - 1].latLng;
                    }

                    // LAST day rules
                    if (day.day === sortedDays[sortedDays.length - 1].day && waypoints.length > 0) {
                        waypoints.push(endPosition);
                    }

                    if (waypoints.length >= 2) {
                        const waypointsKey = JSON.stringify(waypoints);
                        // Deduplication: Only fetch if this specific day changed
                        if (routingCache.current.get(`day-${day.day}`) === waypointsKey && newDayRoutes[day.day]) {
                            continue;
                        }

                        console.log(`[Deduplicator] Fetching new route for Day ${day.day}`);
                        await sleep(300); // Rate limiting
                        const result = await fetchOSRMRouteWithDuration(waypoints);

                        if (result) {
                            newDayRoutes[day.day] = result.geometry;
                            newDayDriveMinutes[day.day] = result.durationSeconds / 60;
                            newDayErrors[day.day] = false;
                        } else {
                            // Fallback
                            newDayRoutes[day.day] = waypoints;
                            newDayErrors[day.day] = true;
                        }
                        routingCache.current.set(`day-${day.day}`, waypointsKey);
                        modified = true;
                    }
                }

                if (modified && !cancelled) {
                    setDayRoutes(newDayRoutes);
                    setDayDriveMinutes(newDayDriveMinutes);
                    setDayRouteErrors(newDayErrors);
                }
            } finally {
                isRoutingBusy.current = false;
            }
        };

        if (showDaysPlan || highlightedDays.size > 0) {
            fetchDayRoutes();
        }

        return () => { cancelled = true; };
    }, [daysPlan, sections, showDaysPlan, highlightedDays.size, startPosition, endPosition]);

    // Fallback straight-line positions
    const fallbackPositions = routeWaypoints;

    // All positions for fit-bounds (include start and end)
    const allPositions = useMemo(() => [startPosition, endPosition, ...mappableSections.map(s => s.latLng)], [mappableSections, startPosition, endPosition]);

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
        const isSelected = selectedSection?.docId === section.docId;
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

    // Print Handler with jsPDF autotable
    const handlePrint = () => {
        const doc = new jsPDF();

        // Sorting
        const sortedDays = [...daysPlan].sort((a, b) => a.day - b.day);

        // Title
        doc.setFontSize(18);
        doc.text("Travel Itinerary", 14, 20);
        doc.setFontSize(11);
        doc.setTextColor(100);

        if (sortedDays.length === 0) {
            doc.text("No itinerary days created yet.", 14, 30);
            doc.save("itinerary.pdf");
            return;
        }

        let finalY = 30;

        sortedDays.forEach((day, index) => {
            // Check for page overflow
            if (finalY > 250) {
                doc.addPage();
                finalY = 20;
            }

            // Day Header
            doc.setFontSize(14);
            doc.setTextColor(0);
            const estTime = getEstimatedTime(day);
            const dateStr = day.date ? ` - ${new Date(day.date + 'T12:00:00').toLocaleDateString()}` : '';
            doc.text(`Day ${day.day}${dateStr} (${estTime})`, 14, finalY);
            finalY += 10;

            // Get stops
            const daySections = sections.filter(s =>
                day.sequences.includes(Number(s.test_sequence))
            ).sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence));

            if (daySections.length === 0) {
                doc.setFontSize(10);
                doc.setTextColor(100);
                doc.text("No stops assigned.", 14, finalY);
                finalY += 15;
            } else {
                // Table Body
                const tableBody = daySections.map(s => [
                    String(s.test_sequence || ''),
                    s.id || '',
                    s.type || '',
                    s.highway || '',
                    s.district || '',
                    s.county || '',
                    s.city || '',
                    s.coordinates || '',
                    s.endCoordinates || ''
                ]);

                autoTable(doc, {
                    startY: finalY,
                    head: [['Seq', 'ID', 'Type', 'Hwy', 'Dist', 'County', 'City', 'Start Coords', 'End Coords']],
                    body: tableBody,
                    theme: 'grid',
                    headStyles: { fillColor: [59, 130, 246] },
                    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
                    columnStyles: {
                        0: { cellWidth: 10 },
                        1: { cellWidth: 15 },
                        7: { cellWidth: 30 },
                        8: { cellWidth: 30 }
                    },
                    margin: { top: 20 },
                });

                finalY = doc.lastAutoTable.finalY + 15;
            }
        });

        doc.save("itinerary.pdf");
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
            <div className="trip-map-header" style={{ flexWrap: 'nowrap', position: 'relative' }}>
                <button onClick={onBack} className="trip-map-back-btn" style={{ flexShrink: 0 }}>
                    <ArrowLeft size={18} />
                    <span>Back</span>
                </button>
                <div className="trip-map-title" style={{ flexGrow: 1, flexShrink: 1, minWidth: 0 }}>
                    <MapPin size={18} style={{ flexShrink: 0 }} />
                    <span style={{ whiteSpace: 'nowrap' }}>Trip Map</span>
                    <span className="trip-map-stats" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {evaluated}/{total} evaluated
                        {orderedRouteSections.length > 0 && ` • ${orderedRouteSections.length} stops`}
                        {routeLoading && ' • Loading route...'}
                    </span>
                </div>

                {/* Desktop controls — shown only on desktop */}
                {!isMobileScreen && (
                    <div className="flex items-center gap-2" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                        {/* Trip Locations */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <div className="badge badge-outline cursor-pointer hover:bg-base-200" onClick={openEditStart} title="Edit Start Location" style={{ padding: '6px 10px', height: 'auto', fontSize: '0.72rem' }}>
                                <MapPin size={11} className="text-green-500 mr-1" /> Start: {startName} {isAdmin && <Edit2 size={9} className="ml-1 opacity-50" />}
                            </div>
                            <div className="badge badge-outline cursor-pointer hover:bg-base-200" onClick={openEditEnd} title="Edit End Location" style={{ padding: '6px 10px', height: 'auto', fontSize: '0.72rem' }}>
                                <Flag size={11} className="text-red-500 mr-1" /> End: {endName} {isAdmin && <Edit2 size={9} className="ml-1 opacity-50" />}
                            </div>
                        </div>

                        {/* Min/stop */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px', borderLeft: '1px solid hsl(var(--border) / 0.5)', borderRight: '1px solid hsl(var(--border) / 0.5)' }}>
                            <label style={{ fontSize: '0.72rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))', whiteSpace: 'nowrap' }}>min/stop</label>
                            <input
                                type="number" min="1" max="480" value={minutesPerStop}
                                onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val) && val > 0) setMinutesPerStop(val); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleApplyMinutes(); }}
                                style={{ width: '50px', padding: '4px 6px', fontSize: '0.82rem', borderRadius: '6px', border: `1.5px solid ${minutesPerStop !== appliedMinutesPerStop ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`, background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', textAlign: 'center', outline: 'none' }}
                                title="Minutes spent at each stop."
                            />
                            <button onClick={handleApplyMinutes} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s', background: justApplied ? '#22c55e' : (minutesPerStop !== appliedMinutesPerStop ? 'hsl(var(--primary))' : 'hsl(var(--muted) / 0.4)'), color: justApplied || minutesPerStop !== appliedMinutesPerStop ? '#fff' : 'hsl(var(--muted-foreground))' }} title="Apply stop time">
                                <Check size={13} />{justApplied ? 'Applied!' : 'Apply'}
                            </button>
                        </div>

                        {/* Export */}
                        <div className="relative">
                            <button onClick={() => setShowExportMenu(!showExportMenu)} className="btn btn-ghost" title="Export Itinerary"><Download size={18} /></button>
                            {showExportMenu && (
                                <div className="absolute top-full right-0 mt-2 border border-[hsl(var(--border))] rounded-lg shadow-lg p-1 flex flex-col gap-1 min-w-[140px] z-[5000]" style={{ backgroundColor: 'hsl(var(--card))' }}>
                                    <button onClick={() => { handlePrint(); setShowExportMenu(false); }} className="btn btn-ghost justify-start text-xs px-2 py-2 h-auto text-left"><Printer size={14} className="mr-2" /> PDF</button>
                                    <button onClick={() => { exportToExcel(orderedRouteSections.length > 0 ? orderedRouteSections : sections, username, showAlert, daysPlan); setShowExportMenu(false); }} className="btn btn-ghost justify-start text-xs px-2 py-2 h-auto text-left"><FileSpreadsheet size={14} className="mr-2" /> Excel</button>
                                </div>
                            )}
                        </div>

                        {/* Sequence */}
                        <button onClick={() => setShowSequenceManager(!showSequenceManager)} className={`btn btn-ghost ${showSequenceManager ? 'bg-accent' : ''}`} style={{ gap: '8px' }} title="Sequence Manager">
                            <ListOrdered size={18} /><span>Sequence</span>
                        </button>

                        {/* Days Plan */}
                        <button onClick={() => setShowDaysPlan(!showDaysPlan)} className={`btn btn-ghost ${showDaysPlan ? 'bg-accent' : ''}`} style={{ gap: '8px' }}>
                            <Calendar size={18} /><span>Days Plan</span>
                        </button>
                    </div>
                )}

                {/* Mobile Hamburger — shown only on mobile */}
                {isMobileScreen && (
                    <button
                        className="btn btn-ghost ml-auto"
                        onClick={() => setShowMobileMenu(prev => !prev)}
                        style={{ flexShrink: 0 }}
                        title="Menu"
                    >
                        {showMobileMenu ? <X size={20} /> : <Menu size={20} />}
                    </button>
                )}
            </div>

            {/* Mobile Dropdown Menu */}
            {isMobileScreen && showMobileMenu && (
                <div style={{ background: 'hsl(var(--card))', borderBottom: '1px solid hsl(var(--border))', padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', zIndex: 4000, position: 'relative' }}>

                    {/* Start / End locations */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div className="badge badge-outline cursor-pointer" onClick={() => { openEditStart(); setShowMobileMenu(false); }} style={{ padding: '10px 12px', height: 'auto', fontSize: '0.8rem', justifyContent: 'flex-start', width: '100%' }}>
                            <MapPin size={14} className="text-green-500 mr-2" /> Start: {startName} {isAdmin && <Edit2 size={12} className="ml-auto opacity-50" />}
                        </div>
                        <div className="badge badge-outline cursor-pointer" onClick={() => { openEditEnd(); setShowMobileMenu(false); }} style={{ padding: '10px 12px', height: 'auto', fontSize: '0.8rem', justifyContent: 'flex-start', width: '100%' }}>
                            <Flag size={14} className="text-red-500 mr-2" /> End: {endName} {isAdmin && <Edit2 size={12} className="ml-auto opacity-50" />}
                        </div>
                    </div>

                    {/* Min/stop */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'hsl(var(--muted)/0.3)', borderRadius: '8px' }}>
                        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'hsl(var(--muted-foreground))' }}>Stop Duration</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="number" min="1" max="480" value={minutesPerStop}
                                onChange={(e) => { const val = parseInt(e.target.value, 10); if (!isNaN(val) && val > 0) setMinutesPerStop(val); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { handleApplyMinutes(); } }}
                                style={{ width: '60px', padding: '6px 8px', fontSize: '0.9rem', borderRadius: '6px', border: `1.5px solid ${minutesPerStop !== appliedMinutesPerStop ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`, background: 'hsl(var(--background))', color: 'hsl(var(--foreground))', textAlign: 'center', outline: 'none' }}
                            />
                            <button onClick={() => { handleApplyMinutes(); }} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, background: justApplied ? '#22c55e' : (minutesPerStop !== appliedMinutesPerStop ? 'hsl(var(--primary))' : 'hsl(var(--muted))'), color: justApplied || minutesPerStop !== appliedMinutesPerStop ? '#fff' : 'hsl(var(--foreground))' }}>
                                <Check size={14} />{justApplied ? 'Applied!' : 'Apply'}
                            </button>
                        </div>
                    </div>

                    {/* Action buttons grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <button onClick={() => { handlePrint(); setShowMobileMenu(false); }} className="btn btn-outline btn-sm gap-2 w-full">
                            <Printer size={15} /> PDF
                        </button>
                        <button onClick={() => { exportToExcel(orderedRouteSections.length > 0 ? orderedRouteSections : sections, username, showAlert, daysPlan); setShowMobileMenu(false); }} className="btn btn-outline btn-sm gap-2 w-full">
                            <FileSpreadsheet size={15} /> Excel
                        </button>
                        <button onClick={() => { setShowSequenceManager(!showSequenceManager); setShowMobileMenu(false); }} className={`btn btn-outline btn-sm gap-2 w-full ${showSequenceManager ? 'bg-primary text-primary-foreground border-primary' : ''}`}>
                            <ListOrdered size={15} /> Sequence
                        </button>
                        <button onClick={() => { setShowDaysPlan(!showDaysPlan); setShowMobileMenu(false); }} className={`btn btn-outline btn-sm gap-2 w-full ${showDaysPlan ? 'bg-primary text-primary-foreground border-primary' : ''}`}>
                            <Calendar size={15} /> Days Plan
                        </button>
                    </div>
                </div>
            )}

            {/* Sequence Manager Panel */}
            {showSequenceManager && (
                <div className="days-plan-panel sequence-manager-panel">
                    <div className="days-plan-header">
                        <div className="flex items-center gap-2">
                            <ListOrdered size={18} />
                            <h3>Sequence Manager</h3>
                        </div>
                        <button onClick={() => setShowSequenceManager(false)} className="btn-icon">
                            <X size={16} />
                        </button>
                    </div>

                    <div className="days-plan-content">
                        <div className="text-xs text-muted mb-4 p-2 bg-accent/30 rounded flex items-center justify-between">
                            <span>Drag to reorder. Numbers stay until you fix/renumber.</span>
                            <button
                                className="btn btn-ghost btn-xs text-primary h-auto py-1"
                                onClick={handleRenumberAll}
                                title="Reset all to 1, 2, 3..."
                            >
                                Renumber 1-N
                            </button>
                        </div>

                        <div className="sequence-item-list">
                            {sequenceList.length === 0 ? (
                                <div className="text-center py-8 text-muted text-sm">No stops with sequence numbers found.</div>
                            ) : (
                                sequenceList.map((sec, index) => (
                                    <div
                                        key={sec.docId}
                                        className={`sequence-mgr-item ${draggedItemIndex === index ? 'dragging' : ''}`}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, index)}
                                        onDragOver={(e) => onDragOver(e, index)}
                                        onDragEnd={onDragEnd}
                                    >
                                        <div className="seq-mgr-drag-handle">
                                            <div className="seq-mgr-hex">#{sec.test_sequence}</div>
                                        </div>
                                        <div className="seq-mgr-info">
                                            <div className="seq-mgr-id">{sec.id}</div>
                                            <div className="seq-mgr-meta">{sec.type} • {sec.county}</div>
                                        </div>
                                        <button
                                            className="btn-icon text-primary hover:bg-primary/10"
                                            onClick={() => handleFixDown(index)}
                                            title="Fix Down (Auto-increment following)"
                                        >
                                            <ArrowDown size={16} />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className="mt-8 flex gap-2">
                            <button
                                className="btn btn-primary flex-1 gap-2"
                                onClick={handleSaveSequence}
                                disabled={isSavingSequence || sequenceList.length === 0}
                            >
                                {isSavingSequence ? (
                                    <span className="loading loading-spinner loading-xs"></span>
                                ) : (
                                    <Save size={16} />
                                )}
                                Save Changes
                            </button>
                            <button
                                className="btn btn-outline"
                                onClick={() => setShowSequenceManager(false)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Days Plan Panel */}
            {showDaysPlan && (
                <div className="days-plan-panel">
                    <div className="days-plan-header">
                        <div className="flex items-center gap-2">
                            <h3>Trip Itinerary</h3>
                            <button
                                onClick={toggleShowAllDays}
                                className="btn-icon"
                                title={showAllDays ? "Hide All Routes" : "Show All Routes"}
                                style={{ padding: '4px' }}
                            >
                                {showAllDays ? <Eye size={14} /> : <EyeOff size={14} />}
                            </button>

                            {/* Global Optimize Buttons */}
                            {isAdmin && (
                                <>
                                    <button
                                        onClick={handleGlobalOptimize}
                                        className="btn-icon text-primary hover:bg-primary/10 ml-2"
                                        title="Global Optimize (Balance All Days)"
                                        disabled={isGlobalOptimizing}
                                    >
                                        {isGlobalOptimizing ? <span className="loading loading-spinner loading-xs"></span> : <Zap size={16} />}
                                    </button>
                                    {hasOptimizeSnapshot && (
                                        <button
                                            onClick={handleGlobalRevert}
                                            className="btn-icon text-warning hover:bg-warning/10"
                                            title="Undo Last Optimization"
                                            disabled={isGlobalOptimizing}
                                        >
                                            <RotateCcw size={16} />
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
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
                                    <div className="flex flex-col flex-1 overflow-hidden gap-1 py-1">
                                        <span className="font-bold" style={{ fontSize: '1.05rem', lineHeight: '1.2' }}>
                                            Day {day.day}
                                        </span>
                                        <div>
                                            <input 
                                                type="date" 
                                                value={day.date || ''} 
                                                onChange={(e) => handleDateChange(day.day, e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                style={{ 
                                                    background: 'transparent',
                                                    border: '1px solid hsl(var(--border))',
                                                    color: day.date ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))',
                                                    borderRadius: '4px',
                                                    padding: '2px 6px',
                                                    fontSize: '0.75rem',
                                                    outline: 'none',
                                                    cursor: 'pointer',
                                                    colorScheme: isDarkTiles ? 'dark' : 'light',
                                                    transition: 'all 0.2s'
                                                }}
                                                onFocus={(e) => e.target.style.borderColor = 'hsl(var(--primary))'}
                                                onBlur={(e) => e.target.style.borderColor = 'hsl(var(--border))'}
                                                title="Assign a date to this day"
                                            />
                                        </div>
                                        <span className="text-xs text-muted flex flex-col sm:flex-row sm:gap-2 mt-0.5">
                                            {dayStats[day.day]?.isError ? (
                                                <span className="text-rose-500 flex items-center gap-1">
                                                    <Navigation size={10} /> Road route unavailable
                                                </span>
                                            ) : dayStats[day.day]?.isLoading ? (
                                                <span className="italic">Estimating time...</span>
                                            ) : (
                                                <span>Est. Time: {getEstimatedTime(day)}</span>
                                            )}
                                        </span>
                                    </div>

                                    <button
                                        className="btn-icon"
                                        onClick={(e) => { e.stopPropagation(); toggleDayHighlight(day.day); }}
                                        style={{ color: highlightedDays.has(day.day) ? CATEGORY_COLORS[(day.day - 1) % CATEGORY_COLORS.length] : 'inherit' }}
                                        title={highlightedDays.has(day.day) ? "Hide on map" : "Show on map"}
                                    >
                                        {highlightedDays.has(day.day) ? <Eye size={16} /> : <EyeOff size={16} />}
                                    </button>

                                    {/* Admin Action Buttons */}
                                    {isAdmin && (
                                        <div className="flex items-center gap-1 ml-2" onClick={e => e.stopPropagation()}>
                                            {(day.sections?.some(s => s.original_sequence) || sections.filter(s => day.sequences?.includes(Number(s.test_sequence))).some(s => s.original_sequence)) ? (
                                                <button
                                                    className="btn-icon text-warning hover:bg-warning/10"
                                                    onClick={() => handleRevertDay(day.day)}
                                                    title="Revert to original sequence"
                                                    disabled={optimizingDay === day.day}
                                                >
                                                    <RotateCcw size={16} />
                                                </button>
                                            ) : (
                                                <button
                                                    className="btn-icon text-primary hover:bg-primary/10"
                                                    onClick={() => handleOptimizeDay(day.day)}
                                                    title="Auto-Optimize Route"
                                                    disabled={optimizingDay === day.day}
                                                >
                                                    {optimizingDay === day.day ? (
                                                        <span className="loading loading-spinner loading-xs"></span>
                                                    ) : (
                                                        <Zap size={16} />
                                                    )}
                                                </button>
                                            )}

                                            <button
                                                className="btn-icon text-destructive hover:bg-destructive/10"
                                                onClick={() => handleRemoveDay(day.day)}
                                                title="Remove Day"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
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
                                                            key={s.docId}
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
                    center={startPosition}
                    zoom={6}
                    style={{ height: '100%', width: '100%' }}
                    zoomControl={true}
                >
                    <TileLayer
                        key={isDarkTiles ? 'dark' : 'light'}
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                        url={isDarkTiles ? DARK_TILES : LIGHT_TILES}
                        crossOrigin="anonymous"
                    />

                    <FitBounds positions={allPositions} selectedPosition={selectedPosition} />
                    <MapClickHandler />
                    <LocationMarker />

                    {/* Start Marker */}
                    <Marker
                        position={startPosition}
                        icon={startIcon}
                        zIndexOffset={2000}
                        eventHandlers={{
                            click: () => openEditStart()
                        }}
                    >
                        <Popup className="trip-map-popup" maxWidth={300}>
                            <div className="popup-content">
                                <div className="popup-header">
                                    <span className="popup-section-id">{startName}</span>
                                </div>
                                <div className="popup-location">
                                    <MapPin size={12} className="text-green-500" />
                                    Starting Point
                                </div>
                                {isAdmin && (
                                    <div className="popup-actions" style={{ marginTop: '8px' }}>
                                        <button
                                            className="popup-view-btn"
                                            onClick={openEditStart}
                                            style={{ width: '100%', justifyContent: 'center' }}
                                        >
                                            Edit Start Location
                                        </button>
                                    </div>
                                )}
                            </div>
                        </Popup>
                    </Marker>

                    {/* End Marker */}
                    <Marker
                        position={endPosition}
                        icon={endIcon}
                        zIndexOffset={2000}
                        eventHandlers={{
                            click: () => openEditEnd()
                        }}
                    >
                        <Popup className="trip-map-popup" maxWidth={300}>
                            <div className="popup-content">
                                <div className="popup-header">
                                    <span className="popup-section-id">{endName}</span>
                                </div>
                                <div className="popup-location">
                                    <Flag size={12} className="text-red-500" />
                                    Ending Point
                                </div>
                                {isAdmin && (
                                    <div className="popup-actions" style={{ marginTop: '8px' }}>
                                        <button
                                            className="popup-view-btn"
                                            onClick={openEditEnd}
                                            style={{ width: '100%', justifyContent: 'center' }}
                                        >
                                            Edit End Location
                                        </button>
                                    </div>
                                )}
                            </div>
                        </Popup>
                    </Marker>

                    {/* Route Polyline — real roads or fallback */}
                    {/* Standard Route Polyline - Only show if NO days are highlighted to avoid clutter, OR if specifically requested */}
                    {/* Standard Route Polyline - Always visible as base layer */}
                    {(routeGeometry || fallbackPositions.length > 1) && (
                        <Polyline
                            positions={routeGeometry || fallbackPositions}
                            pathOptions={{
                                color: '#6366f1',
                                weight: routeGeometry ? 4 : 3,
                                opacity: 0.3, // Dim the main route to be a subtle background
                                dashArray: routeGeometry ? null : '8, 6',
                            }}
                        />
                    )}

                    {/* Day Specific Routes */}
                    {Array.from(highlightedDays).map(dayNum => {
                        const geometry = dayRoutes[dayNum];
                        if (!geometry) return null;
                        const color = CATEGORY_COLORS[(dayNum - 1) % CATEGORY_COLORS.length];

                        return (
                            <Polyline
                                key={`day-route-${dayNum}`}
                                positions={geometry}
                                pathOptions={{
                                    color: color,
                                    weight: 5,
                                    opacity: 0.9,
                                }}
                            />
                        );
                    })}

                    {/* Section Markers */}
                    {mappableSections.map(section => {
                        const isSelected = selectedSection?.docId === section.docId;
                        const icon = getIcon(section);

                        return (
                            <Marker
                                key={section.docId}
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
                                            <div className="popup-coords">
                                                <span style={{fontSize:'0.6rem', opacity:0.7}}>START </span>{section.coordinates}
                                            </div>
                                        )}
                                        {section.endCoordinates && (
                                            <div className="popup-coords">
                                                <span style={{fontSize:'0.6rem', opacity:0.7}}>END </span>{section.endCoordinates}
                                            </div>
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
                                            {section.coordinates && (() => {
                                                const mapsUrl = section.endCoordinates
                                                    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(section.coordinates)}&destination=${encodeURIComponent(section.endCoordinates)}`
                                                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(section.coordinates)}`;
                                                return (
                                                    <a
                                                        className="popup-gmaps-link"
                                                        href={mapsUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        title={section.endCoordinates ? 'View section extent in Google Maps' : 'View in Google Maps'}
                                                    >
                                                        <ExternalLink size={12} />
                                                        {section.endCoordinates ? 'Maps (Start→End)' : 'Google Maps'}
                                                    </a>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        );
                    })}
                </MapContainer>

                {/* Legend */}
                <div className={`trip-map-legend ${isLegendOpen ? 'open' : 'collapsed'}`}>
                    <div
                        className="legend-header"
                        onClick={() => setIsLegendOpen(!isLegendOpen)}
                    >
                        <span className="legend-title">Legend</span>
                        <div className="md:hidden">
                            {isLegendOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                        </div>
                    </div>

                    {isLegendOpen && (
                        <div className="legend-content">
                            <div className="legend-item">
                                <span className="legend-dot" style={{ background: '#22c55e', boxShadow: '0 0 4px #22c55e88' }}></span>
                                <span>Evaluated</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-dot" style={{ background: '#f59e0b', boxShadow: '0 0 4px #f59e0b88' }}></span>
                                <span>Pending</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-dot" style={{ background: '#22c55e', borderColor: '#16a34a' }}></span>
                                <span>Start ({startName})</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-dot" style={{ background: '#ef4444', borderColor: '#dc2626' }}></span>
                                <span>End ({endName})</span>
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
                    )}
                </div>
            </div>

            {/* Edit Location Modal */}
            {
                (isEditingStart || isEditingEnd) && (
                    <div className="fixed inset-0 bg-black/50 z-[3000] flex items-center justify-center p-4">
                        <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-2xl w-full max-w-sm flex flex-col">
                            <div className="flex justify-between items-center p-4 border-b border-[hsl(var(--border))]">
                                <h3 className="text-lg font-bold flex items-center gap-2">
                                    {isEditingStart ? <MapPin className="text-green-500" size={20} /> : <Flag className="text-red-500" size={20} />}
                                    Edit {isEditingStart ? 'Start' : 'End'} Location
                                </h3>
                                <button onClick={() => { setIsEditingStart(false); setIsEditingEnd(false); }} className="btn btn-ghost btn-sm btn-circle">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-4 flex flex-col gap-4">
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted uppercase">Name</label>
                                    <input
                                        type="text"
                                        className="input"
                                        value={editLocName}
                                        onChange={e => setEditLocName(e.target.value)}
                                        placeholder="e.g. Texas Tech"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <label className="text-xs font-semibold text-muted uppercase">Coordinates (Lat, Lng)</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="input flex-1"
                                            value={editLocCoords}
                                            onChange={e => setEditLocCoords(e.target.value)}
                                            placeholder="e.g. 33.587, -101.874"
                                        />
                                        <button
                                            onClick={handleUseMyLocation}
                                            className="btn btn-outline"
                                            title="Use My Location"
                                        >
                                            <Navigation size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div className="p-4 border-t border-[hsl(var(--border))] flex justify-end gap-2">
                                <button onClick={() => { setIsEditingStart(false); setIsEditingEnd(false); }} className="btn btn-ghost">Cancel</button>
                                <button onClick={() => handleSaveLocation(isEditingStart ? 'start' : 'end')} className="btn btn-primary" disabled={savingLoc}>
                                    {savingLoc ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default TripMapView;
