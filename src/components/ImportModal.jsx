import { useState, useRef } from 'react';
import { Upload, AlertTriangle, X, Check } from 'lucide-react';
import { parseCSV, analyzeImport } from '../utils/csvImporter';
import { addSections } from '../db';

const ImportModal = ({ onClose, onImportComplete }) => {
    const [report, setReport] = useState(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [toggledDuplicates, setToggledDuplicates] = useState(new Set());
    const fileInputRef = useRef(null);

    const handleFileChange = async (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        setIsAnalyzing(true);
        try {
            const parsed = await parseCSV(selectedFile);
            const analysis = await analyzeImport(parsed);
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
        const sectionsToImport = [...report.newOrUpdates];
        report.duplicates.forEach((dup, idx) => {
            if (toggledDuplicates.has(idx)) sectionsToImport.push(dup.newSection);
        });
        await addSections(sectionsToImport);
        onImportComplete();
    };

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
                        <div className="file-drop-area" onClick={() => fileInputRef.current?.click()}>
                            <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                            <div style={{ marginBottom: '1rem', color: 'var(--color-primary)' }}><Upload size={32} /></div>
                            <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>Click to upload CSV</p>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>or drag and drop file here</p>
                        </div>
                    )}

                    {report && (
                        <div>
                            <div className="stats-grid">
                                <div className="stat-card new">
                                    <div className="stat-value">{report.newOrUpdates.length}</div>
                                    <div className="stat-label">New</div>
                                </div>
                                <div className="stat-card conflict">
                                    <div className="stat-value">{report.duplicates.length}</div>
                                    <div className="stat-label">Conflicts</div>
                                </div>
                            </div>

                            {report.duplicates.length > 0 && (
                                <div>
                                    <h3><AlertTriangle size={16} color="#f59e0b" /> Conflicts</h3>
                                    <div className="conflict-list">
                                        {report.duplicates.map((dup, idx) => (
                                            <label key={idx} className="conflict-item">
                                                <input type="checkbox" checked={toggledDuplicates.has(idx)} onChange={() => toggleDuplicate(idx)} />
                                                <div>
                                                    <strong>#{dup.newSection.id}</strong> - {dup.reason}
                                                    <div style={{ fontSize: '0.75rem', color: 'gray' }}>
                                                        New: {dup.newSection.coordinates} / Old: {dup.existingSection?.coordinates}
                                                    </div>
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
                        <button onClick={handleImport} className="btn btn-primary">
                            <Check size={18} /> Import {report.newOrUpdates.length + toggledDuplicates.size}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImportModal;
