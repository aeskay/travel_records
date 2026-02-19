import { useState, useRef } from 'react';
import { Upload, AlertTriangle, X, Check, GitMerge } from 'lucide-react';
import { parseCSV, analyzeImport } from '../utils/csvImporter';
import { addSections } from '../db';
import { useUser } from '../context/UserContext';

const ImportModal = ({ onClose, onImportComplete }) => {
    const { user } = useUser();
    const [report, setReport] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [toggledDuplicates, setToggledDuplicates] = useState(new Set());
    const fileInputRef = useRef(null);

    const recognizedFields = [
        { label: 'Section ID', required: true },
        { label: 'Section Type', required: false },
        { label: 'Highway', required: false },
        { label: 'District', required: false },
        { label: 'County', required: false },
        { label: 'City', required: false },
        { label: 'GPS Coordinates', required: false },
        { label: 'Test Sequence', required: false },
    ];

    const handleDownloadTemplate = () => {
        const headers = recognizedFields.map(f => f.label).join(',');
        const blob = new Blob([headers], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'sections_template.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileChange = async (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        setIsAnalyzing(true);
        try {
            const parsed = await parseCSV(selectedFile);
            const analysis = await analyzeImport(parsed, user?.username);
            setReport(analysis);
        } catch (err) {
            console.error(err);
            alert('Error parsing CSV');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const toggleDuplicate = (index) => {
        const next = new Set(toggledDuplicates);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setToggledDuplicates(next);
    };

    const handleImport = async () => {
        if (!report) return;

        try {
            if (!user) throw new Error("User not authenticated");

            // 1. Import brand new sections (full write)
            if (report.newOrUpdates.length > 0) {
                await addSections(report.newOrUpdates, user.username);
            }

            // 2. Merge sections with new fields (merge mode — appends, doesn't overwrite)
            if (report.mergeable.length > 0) {
                const mergeData = report.mergeable.map(m => m.newSection);
                await addSections(mergeData, user.username, { merge: true });
            }

            // 3. Force-import any toggled duplicates
            const forcedDuplicates = [];
            report.duplicates.forEach((dup, idx) => {
                if (toggledDuplicates.has(idx)) {
                    forcedDuplicates.push(dup.newSection);
                }
            });
            if (forcedDuplicates.length > 0) {
                await addSections(forcedDuplicates, user.username);
            }

            onImportComplete();
        } catch (err) {
            console.error("Import error details:", err);
            alert("Import failed: " + err.message);
        }
    };

    const totalImportCount = (report?.newOrUpdates.length || 0) + (report?.mergeable.length || 0) + toggledDuplicates.size;

    return (
        <div className="modal-overlay">
            <div className="modal-content fade-in">
                <div className="modal-header">
                    <h2>Import Sections</h2>
                    <button className="btn btn-glass" onClick={onClose}><X size={20} /></button>
                </div>

                <div className="modal-body">
                    {isAnalyzing && (
                        <div style={{ textAlign: 'center', padding: '2rem' }}>
                            <p>Analyzing CSV file...</p>
                        </div>
                    )}

                    {!report && !isAnalyzing && (
                        <div className="import-setup">
                            <div className="file-drop-area" onClick={() => fileInputRef.current?.click()}>
                                <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                                <div style={{ marginBottom: '1rem', color: 'var(--color-primary)' }}><Upload size={32} /></div>
                                <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>Click to upload CSV</p>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>or drag and drop file here</p>
                            </div>

                            <div className="import-info-box">
                                <div className="info-header">
                                    <h3>CSV Structure</h3>
                                    <button className="btn btn-glass btn-sm" onClick={handleDownloadTemplate} title="Download Excel-ready template">
                                        Download Template
                                    </button>
                                </div>
                                <p className="info-description">
                                    Your CSV should include the following columns.
                                    Extra columns will be saved as additional section details.
                                </p>
                                <div className="fields-grid">
                                    {recognizedFields.map(f => (
                                        <div key={f.label} className={`field-tag ${f.required ? 'required' : ''}`}>
                                            {f.label} {f.required && <span className="req-star">*</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {report && (
                        <div>
                            <div className="stats-grid">
                                <div className="stat-card new">
                                    <div className="stat-value">{report.newOrUpdates.length}</div>
                                    <div className="stat-label">New</div>
                                </div>
                                <div className="stat-card" style={{ borderLeft: '3px solid #3b82f6' }}>
                                    <div className="stat-value">{report.mergeable.length}</div>
                                    <div className="stat-label">Merge</div>
                                </div>
                                <div className="stat-card conflict">
                                    <div className="stat-value">{report.duplicates.length}</div>
                                    <div className="stat-label">Skipped</div>
                                </div>
                            </div>

                            {/* Mergeable sections */}
                            {report.mergeable.length > 0 && (
                                <div style={{ marginTop: '1rem' }}>
                                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem' }}>
                                        <GitMerge size={16} color="#3b82f6" /> Auto-merge ({report.mergeable.length})
                                    </h3>
                                    <p style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
                                        These sections already exist but have new fields that will be appended.
                                    </p>
                                    <div className="conflict-list" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                        {report.mergeable.map((m, idx) => (
                                            <div key={idx} className="conflict-item" style={{ padding: '0.5rem 0.75rem' }}>
                                                <div>
                                                    <strong>#{m.newSection.id}</strong>
                                                    <span style={{ fontSize: '0.75rem', color: '#3b82f6', marginLeft: '8px' }}>
                                                        + {m.fieldNames.join(', ')}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* True duplicates */}
                            {report.duplicates.length > 0 && (
                                <div style={{ marginTop: '1rem' }}>
                                    <h3><AlertTriangle size={16} color="#f59e0b" /> Skipped ({report.duplicates.length})</h3>
                                    <p style={{ fontSize: '0.8rem', color: 'hsl(var(--muted-foreground))', marginBottom: '0.5rem' }}>
                                        Identical data, no changes needed. Check to force re-import.
                                    </p>
                                    <div className="conflict-list">
                                        {report.duplicates.map((dup, idx) => (
                                            <label key={idx} className="conflict-item">
                                                <input type="checkbox" checked={toggledDuplicates.has(idx)} onChange={() => toggleDuplicate(idx)} />
                                                <div>
                                                    <strong>#{dup.newSection.id}</strong> - {dup.reason}
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    <button onClick={onClose} className="btn btn-glass">Cancel</button>
                    {report && (
                        <button onClick={handleImport} className="btn btn-primary" disabled={totalImportCount === 0}>
                            <Check size={18} /> Import {totalImportCount}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportModal;
