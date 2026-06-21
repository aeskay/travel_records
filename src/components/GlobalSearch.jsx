import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, FolderOpen, MapPin, FileText, ChevronDown, ChevronRight, Loader, ArrowRight } from "lucide-react";
import { getSections, getDetails } from "../db";

const stripHtml = (html) => {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
};

const getHighlightedSnippet = (text, query, windowSize = 80) => {
    if (!text || !query) return null;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return null;
    const start = Math.max(0, idx - windowSize / 2);
    const end = Math.min(text.length, idx + query.length + windowSize / 2);
    const prefix = start > 0 ? "…" : "";
    const suffix = end < text.length ? "…" : "";
    const before = text.slice(start, idx);
    const match = text.slice(idx, idx + query.length);
    const after = text.slice(idx + query.length, end);
    return (
        <span>
            {prefix}{before}
            <mark style={{ background: "hsl(var(--primary) / 0.25)", color: "hsl(var(--primary))", borderRadius: "2px", padding: "0 2px", fontWeight: 600 }}>{match}</mark>
            {after}{suffix}
        </span>
    );
};

const matchesQuery = (text, query) => text && text.toLowerCase().includes(query.toLowerCase());

const GlobalSearch = ({ projects, onNavigate }) => {
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState({ trips: [], sections: [], notes: [] });
    const [collapsed, setCollapsed] = useState({ trips: false, sections: false, notes: false });
    const allSectionsRef = useRef(null);
    const allDetailsRef = useRef(null);
    const debounceRef = useRef(null);
    const inputRef = useRef(null);
    const wrapperRef = useRef(null);

    const totalResults = results.trips.length + results.sections.length + results.notes.length;

    useEffect(() => {
        const handleClick = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false); };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    useEffect(() => {
        const handleKey = (e) => { if (e.key === "Escape") { setIsOpen(false); setQuery(""); } };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, []);

    const loadAllData = useCallback(async () => {
        if (allSectionsRef.current) return;
        setIsLoading(true);
        try {
            const sectionsByProject = {};
            const detailsBySectionDocId = {};
            await Promise.all(projects.map(async (project) => {
                try { sectionsByProject[project.id] = await getSections(null, project.id) || []; }
                catch { sectionsByProject[project.id] = []; }
            }));
            allSectionsRef.current = sectionsByProject;
            const allSections = Object.values(sectionsByProject).flat();
            await Promise.all(allSections.map(async (section) => {
                try { detailsBySectionDocId[section.docId] = await getDetails(section.docId, null) || []; }
                catch { detailsBySectionDocId[section.docId] = []; }
            }));
            allDetailsRef.current = detailsBySectionDocId;
        } catch (err) {
            console.error("[GlobalSearch] Error loading data:", err);
        } finally {
            setIsLoading(false);
        }
    }, [projects]);

    const runSearch = useCallback((q) => {
        if (!q || q.trim().length < 2) { setResults({ trips: [], sections: [], notes: [] }); return; }
        const trimmed = q.trim();
        const tripMatches = projects.filter(p => matchesQuery(p.name, trimmed)).map(p => ({ project: p }));
        const sectionMatches = [];
        const noteMatches = [];
        if (allSectionsRef.current) {
            for (const project of projects) {
                const sections = allSectionsRef.current[project.id] || [];
                for (const section of sections) {
                    const fields = [section.id, section.name, section.type, section.street, section.location];
                    const matchedField = fields.find(f => matchesQuery(f, trimmed));
                    if (matchedField) sectionMatches.push({ project, section, matchField: matchedField });
                    if (allDetailsRef.current) {
                        const details = allDetailsRef.current[section.docId] || [];
                        for (const detail of details) {
                            const plainText = stripHtml(detail.content);
                            if (matchesQuery(plainText, trimmed)) noteMatches.push({ project, section, detail, plainText });
                        }
                    }
                }
            }
        }
        setResults({ trips: tripMatches.slice(0, 10), sections: sectionMatches.slice(0, 15), notes: noteMatches.slice(0, 15) });
    }, [projects]);

    const handleQueryChange = (e) => {
        const q = e.target.value;
        setQuery(q);
        setIsOpen(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (q.trim().length < 2) { setResults({ trips: [], sections: [], notes: [] }); return; }
        debounceRef.current = setTimeout(async () => {
            if (!allSectionsRef.current) await loadAllData();
            runSearch(q);
        }, 300);
    };

    useEffect(() => { if (!isLoading && query.trim().length >= 2) runSearch(query); }, [isLoading, query, runSearch]);

    const handleNavigate = (project, section) => { setIsOpen(false); setQuery(""); onNavigate(project, section || null); };
    const toggleGroup = (group) => setCollapsed(prev => ({ ...prev, [group]: !prev[group] }));
    const showPanel = isOpen && query.trim().length >= 2;

    const pillStyle = (color) => ({ fontSize: "11px", background: `${color}22`, color, padding: "1px 7px", borderRadius: "99px", fontWeight: 600 });
    const groupHeaderStyle = (borderTop) => ({
        width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px",
        background: "none", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.15s",
        borderTop: borderTop ? "1px solid hsl(var(--border) / 0.3)" : "none",
    });
    const rowStyle = { width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px 9px 28px", background: "none", border: "none", cursor: "pointer", textAlign: "left", transition: "background 0.15s", borderBottom: "1px solid hsl(var(--border) / 0.2)" };

    return (
        <div ref={wrapperRef} style={{ position: "relative", flex: 1, maxWidth: "420px" }}>
            <style>{`
                .gs-input-wrap { display:flex;align-items:center;gap:8px;background:hsl(var(--muted)/0.3);border:1px solid hsl(var(--border)/0.6);border-radius:12px;padding:8px 14px;transition:all 0.2s; }
                .gs-input-wrap.open { box-shadow:0 0 0 2px hsl(var(--primary)/0.2);border-color:hsl(var(--primary)/0.5); }
                .gs-input { background:none;border:none;outline:none;font-size:13px;color:hsl(var(--foreground));flex:1;min-width:0; }
                .gs-clear { background:none;border:none;cursor:pointer;padding:0;color:hsl(var(--muted-foreground));display:flex; }
                .gs-panel { position:absolute;top:calc(100% + 8px);left:0;right:0;min-width:340px;background:hsl(var(--card));border:1px solid hsl(var(--border)/0.5);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.3);overflow:hidden;z-index:9999;animation:gsPanelIn 0.15s ease;backdrop-filter:blur(12px); }
                @keyframes gsPanelIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
                .gs-panel-scroll { max-height:420px;overflow-y:auto; }
                .gs-group-btn:hover { background:hsl(var(--muted)/0.2) !important; }
                .gs-row:hover { background:hsl(var(--muted)/0.4) !important; }
                .gs-label { font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px; }
                .gs-meta { font-size:11px;color:hsl(var(--muted-foreground));margin-top:1px;display:flex;gap:4px;align-items:center;flex-wrap:wrap; }
                .gs-arrow { color:hsl(var(--muted-foreground));flex-shrink:0; }
                .gs-footer { padding:8px 14px;font-size:11px;color:hsl(var(--muted-foreground));border-top:1px solid hsl(var(--border)/0.3);text-align:right; }
                .gs-footer kbd { background:hsl(var(--muted));padding:1px 4px;border-radius:3px;font-size:10px; }
            `}</style>

            <div className={`gs-input-wrap ${isOpen ? "open" : ""}`}>
                {isLoading
                    ? <Loader size={15} style={{ color: "hsl(var(--primary))", flexShrink: 0 }} className="animate-spin" />
                    : <Search size={15} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
                }
                <input ref={inputRef} className="gs-input" type="text" placeholder="Search trips, sections, notes…"
                    value={query} onChange={handleQueryChange} onFocus={() => query.trim().length >= 2 && setIsOpen(true)} />
                {query && (
                    <button className="gs-clear" onClick={() => { setQuery(""); setResults({ trips: [], sections: [], notes: [] }); setIsOpen(false); inputRef.current?.focus(); }}>
                        <X size={14} />
                    </button>
                )}
            </div>

            {showPanel && (
                <div className="gs-panel">
                    {isLoading && (
                        <div style={{ padding: "24px", textAlign: "center", color: "hsl(var(--muted-foreground))", fontSize: "13px", display: "flex", gap: "8px", alignItems: "center", justifyContent: "center" }}>
                            <Loader size={14} className="animate-spin" /> Loading all data…
                        </div>
                    )}
                    {!isLoading && totalResults === 0 && (
                        <div style={{ padding: "24px", textAlign: "center", color: "hsl(var(--muted-foreground))", fontSize: "13px" }}>
                            No results for "<strong>{query}</strong>"
                        </div>
                    )}
                    {!isLoading && totalResults > 0 && (
                        <div className="gs-panel-scroll">
                            {results.trips.length > 0 && (
                                <div>
                                    <button className="gs-group-btn" onClick={() => toggleGroup("trips")} style={groupHeaderStyle(false)}>
                                        <FolderOpen size={13} style={{ color: "hsl(var(--primary))" }} />
                                        <span className="gs-label" style={{ color: "hsl(var(--primary))" }}>Trips</span>
                                        <span style={pillStyle("hsl(var(--primary))")}>{results.trips.length}</span>
                                        <span style={{ marginLeft: "auto" }} className="gs-arrow">{collapsed.trips ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
                                    </button>
                                    {!collapsed.trips && results.trips.map(({ project }) => (
                                        <button key={project.id} className="gs-row" onClick={() => handleNavigate(project, null)} style={rowStyle}>
                                            <FolderOpen size={14} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(var(--foreground))" }}>{getHighlightedSnippet(project.name, query) || project.name}</div>
                                                {project.status === "completed" && <div style={{ fontSize: "10px", color: "hsl(var(--muted-foreground))" }}>Completed</div>}
                                            </div>
                                            <ArrowRight size={12} className="gs-arrow" />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {results.sections.length > 0 && (
                                <div>
                                    <button className="gs-group-btn" onClick={() => toggleGroup("sections")} style={groupHeaderStyle(results.trips.length > 0)}>
                                        <MapPin size={13} style={{ color: "#f59e0b" }} />
                                        <span className="gs-label" style={{ color: "#f59e0b" }}>Sections</span>
                                        <span style={pillStyle("#f59e0b")}>{results.sections.length}</span>
                                        <span style={{ marginLeft: "auto" }} className="gs-arrow">{collapsed.sections ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
                                    </button>
                                    {!collapsed.sections && results.sections.map(({ project, section, matchField }, i) => (
                                        <button key={section.docId || i} className="gs-row" onClick={() => handleNavigate(project, section)} style={rowStyle}>
                                            <MapPin size={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: "13px", fontWeight: 600, color: "hsl(var(--foreground))" }}>{getHighlightedSnippet(matchField, query) || matchField}</div>
                                                <div className="gs-meta">
                                                    <span style={{ fontWeight: 600, color: "hsl(var(--primary) / 0.8)" }}>{project.name}</span>
                                                    {section.type && <><span>·</span><span>{section.type}</span></>}
                                                </div>
                                            </div>
                                            <ArrowRight size={12} className="gs-arrow" />
                                        </button>
                                    ))}
                                </div>
                            )}

                            {results.notes.length > 0 && (
                                <div>
                                    <button className="gs-group-btn" onClick={() => toggleGroup("notes")} style={groupHeaderStyle(true)}>
                                        <FileText size={13} style={{ color: "#22c55e" }} />
                                        <span className="gs-label" style={{ color: "#22c55e" }}>Notes</span>
                                        <span style={pillStyle("#22c55e")}>{results.notes.length}</span>
                                        <span style={{ marginLeft: "auto" }} className="gs-arrow">{collapsed.notes ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</span>
                                    </button>
                                    {!collapsed.notes && results.notes.map(({ project, section, detail, plainText }, i) => (
                                        <button key={detail.id || i} className="gs-row" onClick={() => handleNavigate(project, section)} style={{ ...rowStyle, alignItems: "flex-start" }}>
                                            <FileText size={14} style={{ color: "#22c55e", flexShrink: 0, marginTop: "2px" }} />
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: "12px", color: "hsl(var(--foreground))", lineHeight: 1.5, wordBreak: "break-word" }}>{getHighlightedSnippet(plainText, query)}</div>
                                                <div className="gs-meta" style={{ marginTop: "3px" }}>
                                                    <span style={{ fontWeight: 600, color: "hsl(var(--primary) / 0.8)" }}>{project.name}</span>
                                                    <span>›</span>
                                                    <span>{section.name || section.id}</span>
                                                </div>
                                            </div>
                                            <ArrowRight size={12} className="gs-arrow" style={{ marginTop: "3px" }} />
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="gs-footer">
                                {totalResults} result{totalResults !== 1 ? "s" : ""} · Press <kbd>Esc</kbd> to close
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default GlobalSearch;
