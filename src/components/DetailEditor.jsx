import { useState, useEffect, useCallback, useRef } from 'react';
import { getDetails, addDetail, updateDetail, deleteDetail } from '../db';
import { History, Save, Edit3, Camera, Mic, X, Image as LucideImage, Square, Trash2, Check, RotateCcw } from 'lucide-react';
import ImageResizer from './ImageResizer';
import { useUser } from '../context/UserContext';

const DetailEditor = ({ sectionId }) => {
    const { user } = useUser();
    const [details, setDetails] = useState([]);
    const [isRecording, setIsRecording] = useState(false);
    const [editingId, setEditingId] = useState(null); // ID of detail being edited
    const [selectedImg, setSelectedImg] = useState(null); // For main editor

    const editorRef = useRef(null);
    const fileInputRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const chunksRef = useRef([]);

    const loadDetails = useCallback(async () => {
        try {
            if (!sectionId || !user) return;
            const data = await getDetails(sectionId, user.username);
            if (Array.isArray(data)) {
                // Sort Oldest -> Newest (as requested)
                setDetails([...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
            } else {
                setDetails([]);
            }
        } catch (err) {
            console.error("Error loading details:", err);
            setDetails([]);
        }
    }, [sectionId, user]);

    useEffect(() => {
        loadDetails();
        if (editorRef.current) editorRef.current.innerHTML = '';
        setIsRecording(false);
        setEditingId(null);
        setSelectedImg(null);
    }, [loadDetails]);

    // --- Media Handlers ---

    const insertHtmlAtCursor = (html) => {
        const sel = window.getSelection();
        if (sel.rangeCount) {
            let range = sel.getRangeAt(0);

            // Ensure we are inserting inside the editor
            if (!editorRef.current.contains(range.commonAncestorContainer)) {
                editorRef.current.focus();
                // move cursor to end if focus was lost
                const newRange = document.createRange();
                newRange.selectNodeContents(editorRef.current);
                newRange.collapse(false);
                sel.removeAllRanges();
                sel.addRange(newRange);
                range = newRange;
            }

            range.deleteContents();
            const el = document.createElement("div");
            el.innerHTML = html;
            let frag = document.createDocumentFragment();
            let node, lastNode;
            while ((node = el.firstChild)) {
                lastNode = frag.appendChild(node);
            }
            range.insertNode(frag);

            // Move cursor after inserted content
            if (lastNode) {
                range.setStartAfter(lastNode);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        } else {
            editorRef.current.focus();
            editorRef.current.innerHTML += html;
        }
    };

    const handleImageSelect = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = () => {
            const imgHtml = `<img src="${reader.result}" style="max-width: 100%; width: 200px; border-radius: 8px; margin: 0.5rem 0;" /><br/>`;
            insertHtmlAtCursor(imgHtml);
        };
        reader.readAsDataURL(file);
        e.target.value = ''; // Reset
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            chunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };

            mediaRecorderRef.current.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
                const reader = new FileReader();
                reader.onloadend = () => {
                    const audioHtml = `<br/><audio controls src="${reader.result}" style="width: 100%; margin: 0.5rem 0;"></audio><br/>`;
                    insertHtmlAtCursor(audioHtml);
                };
                reader.readAsDataURL(blob);
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);
        } catch (err) {
            console.error("Error accessing microphone:", err);
            alert("Could not access microphone.");
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            setIsRecording(false);
        }
    };

    const handleEditorClick = (e) => {
        if (e.target.tagName === 'IMG') {
            setSelectedImg(e.target);
        } else {
            // Only deselect if checking outside the resize overlay
            // But since overlay is separate, e.target will be the editor div or other content
            setSelectedImg(null);
        }
    };

    // --- CRUD Handlers ---

    const handleSaveNew = async () => {
        if (!editorRef.current) return;
        const content = editorRef.current.innerHTML;
        if (!content.trim() || content === '<br>') return;

        const newDetail = {
            sectionId,
            content, // Content now contains inline images/audio
            timestamp: new Date().toISOString(),
        };
        await addDetail(newDetail);
        editorRef.current.innerHTML = ''; // Clear
        setSelectedImg(null);
        await loadDetails();
    };

    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this note?")) {
            await deleteDetail(id);
            await loadDetails();
        }
    };

    const handleUpdate = async (id, newContent) => {
        const detail = details.find(d => d.id === id);
        if (!detail) return;

        await updateDetail({
            ...detail,
            content: newContent
        });
        setEditingId(null);
        await loadDetails();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', marginBottom: '2rem' }}>
            <div className="flex justify-between items-center">
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', gap: '0.5rem' }}>
                    <History color="var(--color-primary)" /> Section History
                </h3>
            </div>

            {/* History List (Oldest to Newest) */}
            <div className="details-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {details.map((detail) => (
                    <HistoryItem
                        key={detail.id}
                        detail={detail}
                        isEditing={editingId === detail.id}
                        onEditStart={() => setEditingId(detail.id)}
                        onEditCancel={() => setEditingId(null)}
                        onEditSave={(content) => handleUpdate(detail.id, content)}
                        onDelete={() => handleDelete(detail.id)}
                    />
                ))}
            </div>

            {/* Main Editor (New Input) */}
            <div className="editor-container" style={{ border: '1px solid var(--color-border)', marginTop: '1rem', position: 'relative' }}>
                <div
                    ref={editorRef}
                    className="input-field"
                    contentEditable
                    style={{
                        minHeight: '120px',
                        maxHeight: '400px',
                        overflowY: 'auto',
                        padding: '1rem',
                        outline: 'none',
                        border: 'none',
                        background: 'transparent'
                    }}
                    placeholder="Add details, images, or voice notes..."
                    onClick={handleEditorClick}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            // Optional
                        }
                    }}
                />

                {/* Resize Overlay for Main Editor */}
                {selectedImg && (
                    <ImageResizer
                        image={selectedImg}
                        onDeselect={() => setSelectedImg(null)}
                        onRemove={() => {
                            selectedImg.remove();
                            setSelectedImg(null);
                        }}
                    />
                )}

                {/* Toolbar */}
                <div style={{
                    padding: '0.5rem 1rem',
                    background: 'rgba(0,0,0,0.02)',
                    borderTop: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                            type="file"
                            ref={fileInputRef}
                            accept="image/*"
                            capture="environment" // Direct camera on mobile
                            style={{ display: 'none' }}
                            onChange={handleImageSelect}
                        />
                        <button
                            className="btn btn-glass"
                            style={{ padding: '0.5rem' }}
                            title="Insert Image"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <LucideImage size={18} />
                        </button>

                        <button
                            className={`btn ${isRecording ? 'btn-danger' : 'btn-glass'}`}
                            style={{ padding: '0.5rem', color: isRecording ? '#ef4444' : 'inherit' }}
                            title={isRecording ? "Stop Recording" : "Record Audio"}
                            onClick={isRecording ? stopRecording : startRecording}
                        >
                            {isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
                        </button>
                        {isRecording && <span className="fade-in" style={{ fontSize: '0.8rem', color: '#ef4444' }}>Recording...</span>}
                    </div>

                    <button onClick={handleSaveNew} className="btn btn-primary">
                        <Save size={18} /> Add Note
                    </button>
                </div>
            </div>
        </div>
    );
};

// Subcomponent for individual history items to handle edit state
const HistoryItem = ({ detail, isEditing, onEditStart, onEditCancel, onEditSave, onDelete }) => {
    const itemRef = useRef(null);
    const [selectedImg, setSelectedImg] = useState(null);

    useEffect(() => {
        if (isEditing && itemRef.current) {
            itemRef.current.innerHTML = detail.content;
            itemRef.current.focus();
        } else {
            setSelectedImg(null);
        }
    }, [isEditing, detail.content]);

    const handleClick = (e) => {
        if (!isEditing) return;
        if (e.target.tagName === 'IMG') {
            setSelectedImg(e.target);
        } else {
            setSelectedImg(null);
        }
    };

    return (
        <div className="detail-history-item" style={{ position: 'relative', border: isEditing ? '2px solid var(--color-primary)' : '1px solid var(--color-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                    {new Date(detail.timestamp).toLocaleString()}
                </span>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {isEditing ? (
                        <>
                            <button onClick={() => onEditSave(itemRef.current.innerHTML)} className="btn btn-primary" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                                <Check size={14} /> Save
                            </button>
                            <button onClick={onEditCancel} className="btn btn-glass" style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}>
                                <X size={14} /> Cancel
                            </button>
                        </>
                    ) : (
                        <>
                            <button onClick={onEditStart} className="btn btn-glass" style={{ padding: '0.2rem', color: 'var(--color-text-secondary)' }} title="Edit">
                                <Edit3 size={14} />
                            </button>
                            <button onClick={onDelete} className="btn btn-glass" style={{ padding: '0.2rem', color: 'var(--color-danger)' }} title="Delete">
                                <Trash2 size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {isEditing ? (
                <div style={{ position: 'relative' }}>
                    <div
                        ref={itemRef}
                        className="input-field"
                        contentEditable
                        onClick={handleClick}
                        style={{
                            minHeight: '60px',
                            padding: '0.5rem',
                            outline: 'none',
                            border: 'none',
                            background: 'rgba(0,0,0,0.1)'
                        }}
                    />
                    {selectedImg && (
                        <ImageResizer
                            image={selectedImg}
                            onDeselect={() => setSelectedImg(null)}
                            onRemove={() => {
                                selectedImg.remove();
                                setSelectedImg(null);
                            }}
                        />
                    )}
                </div>
            ) : (
                <div className="ql-editor" style={{ padding: 0 }} dangerouslySetInnerHTML={{ __html: detail.content }} />
            )}
        </div>
    );
};

export default DetailEditor;
