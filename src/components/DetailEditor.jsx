import { useState, useEffect, useCallback, useRef } from 'react';
import { getDetails, addDetail, updateDetail, deleteDetail, addSection, subscribeToDetails } from '../db';
import { History, Save, Edit3, Camera, Mic, X, Image as LucideImage, Square, Trash2, Check, RotateCcw, RefreshCw } from 'lucide-react';
import ImageResizer from './ImageResizer';
import ImageLightbox from './ImageLightbox';
import { useUser } from '../context/UserContext';
import { useVoiceLogger } from '../hooks/useVoiceLogger';

const DetailEditor = ({ section, onUpdate }) => {
    const { user } = useUser();
    const [details, setDetails] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [editingId, setEditingId] = useState(null); // ID of detail being edited
    const [selectedImg, setSelectedImg] = useState(null); // For main editor
    const [lightboxSrc, setLightboxSrc] = useState(null); // For image popup

    // Voice Logger Hook
    const {
        startRecording,
        stopRecording,
        transcribeAudio,
        status: voiceStatus,
        modelProgress,
        error: voiceError
    } = useVoiceLogger();

    const editorRef = useRef(null);
    const cameraInputRef = useRef(null);
    const galleryInputRef = useRef(null);
    const endOfListRef = useRef(null);

    // Track if we've already inserted the current transcript to avoid duplicates
    const lastInsertedTranscriptRef = useRef(null);

    // Real-time subscription
    useEffect(() => {
        if (!section?.docId || !user) return;

        const unsubscribe = subscribeToDetails(section.docId, user.username, (newDetails) => {
            setDetails(newDetails);
        });

        return () => unsubscribe();
    }, [section?.docId, user]);

    useEffect(() => {
        if (editorRef.current) {
            editorRef.current.innerHTML = '';
        }
        setEditingId(null);
        setSelectedImg(null);
    }, [section?.docId]);

    // Auto-scroll to bottom of timeline when details change
    useEffect(() => {
        if (endOfListRef.current) {
            endOfListRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [details]);


    // Whisper sentinel strings that should never appear in a note as real transcript text.
    const WHISPER_SENTINEL_RE = /^\s*(\[BLANK_AUDIO\]|\[SILENCE\]|\[ Silence \]|no speech detected\.?|\(no speech\)|\.)?\s*$/i;

    // Handle Mic Toggle
    const handleToggleRecording = async () => {
        if (voiceStatus === 'recording') {
            try {
                const blob = await stopRecording();
                if (!blob) return;

                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = () => {
                    const base64Audio = reader.result;
                    const audioHtml = `
                        <br/>
                        <div class="audio-note-container" style="border: 1px solid hsl(var(--border)); border-radius: 8px; padding: 0.5rem; background: hsl(var(--card)); margin: 0.5rem 0;">
                            <audio controls src="${base64Audio}" style="width: 100%; margin-bottom: 0.5rem;"></audio>
                        </div>
                        <br/>
                    `;
                    insertHtmlAtCursor(audioHtml);
                };
            } catch (err) {
                console.error("Failed to stop recording:", err);
                alert("Recording failed to stop properly.");
            }
        } else {
            startRecording();
        }
    };


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

    const compressImage = (file, maxWidth = 600, quality = 0.4) => {
        return new Promise((resolve) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                if (w > maxWidth) {
                    h = (maxWidth / w) * h;
                    w = maxWidth;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const dataUrl = canvas.toDataURL('image/jpeg', quality);
                URL.revokeObjectURL(url);
                resolve(dataUrl);
            };
            img.src = url;
        });
    };

    const handleImageSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const dataUrl = await compressImage(file);
        const imgHtml = `<img src="${dataUrl}" style="max-width: 100%; width: 200px; border-radius: 8px; margin: 0.5rem 0;" /><br/>`;
        insertHtmlAtCursor(imgHtml);
        e.target.value = '';
    };

    const [debugLogs, setDebugLogs] = useState([]);

    const addLog = (msg) => {
        console.log(msg);
        setDebugLogs(prev => [new Date().toLocaleTimeString() + ': ' + msg, ...prev].slice(0, 20));
    };

    const handleEditorClick = (e) => {
        if (e.target.tagName === 'IMG') {
            setSelectedImg(e.target);
        } else {
            setSelectedImg(null);
        }
    };

    // --- CRUD Handlers ---

    // Re-compress all images in HTML to fit within Firestore limit
    const recompressContent = (html) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const images = doc.querySelectorAll('img[src^="data:"]');
        images.forEach(img => {
            const canvas = document.createElement('canvas');
            const tmpImg = new Image();
            tmpImg.src = img.src;
            let w = Math.min(tmpImg.naturalWidth || 400, 400);
            let h = (w / (tmpImg.naturalWidth || 400)) * (tmpImg.naturalHeight || 300);
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tmpImg, 0, 0, w, h);
            img.src = canvas.toDataURL('image/jpeg', 0.25);
        });
        // Strip audio if still too large (text-only fallback)
        const result = doc.body.innerHTML;
        if (new Blob([result]).size > 900_000) {
            doc.querySelectorAll('audio').forEach(a => {
                const note = document.createElement('em');
                note.textContent = '[Audio removed — recording was too large]';
                a.replaceWith(note);
            });
            return doc.body.innerHTML;
        }
        return result;
    };

    const handleSaveNew = async () => {
        // Remove isSaving check to allow multiple sends
        if (!editorRef.current || !user) return;
        let content = editorRef.current.innerHTML;

        const hasText = editorRef.current.textContent.trim().length > 0;
        const hasMedia = content.includes('<img') || content.includes('<audio');
        if (!hasText && !hasMedia) return;

        setIsSaving(true);
        try {
            const timestamp = new Date();
            const header = `
                <div style="font-size: 0.85rem; color: hsl(var(--muted-foreground)); margin-bottom: 0.5rem; border-bottom: 1px solid hsl(var(--border)); padding-bottom: 0.25rem;">
                    <strong>${user.username}</strong> • GPS: ${section.coordinates || 'N/A'}
                </div>
            `;

            // If content is too large for Firestore, re-compress images inline
            if (new Blob([header + content]).size > 900_000) {
                content = recompressContent(content);
            }

            const newDetail = {
                sectionId: section.docId,
                content: header + content,
                timestamp: timestamp.toISOString(),
            };

            // Optimistic Update: Show immediately with pending status
            const tempId = 'temp-' + Date.now();
            setDetails(prev => [...prev, { ...newDetail, id: tempId, status: 'sending' }]);

            // Clear editor immediately
            editorRef.current.innerHTML = '';
            setSelectedImg(null);

            // Send to DB
            await addDetail(newDetail, user.username);

            // Update parent section timestamp (fire and forget for UI responsiveness)
            addSection({
                ...section,
                lastModified: new Date().toISOString(),
                lastModifiedBy: user.username
            }, user.username).catch(console.error);

            if (onUpdate) onUpdate();

            // No need to reload - subscription handles it
        } catch (err) {
            console.error("Error saving note:", err);
            // Optionally update the temp item to show error state, but for now we trust retry or user awareness
            alert("Failed to save note: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (confirm("Are you sure you want to delete this note?")) {
            await deleteDetail(id, user.username);
            // Update parent section timestamp
            await addSection({
                ...section,
                lastModified: new Date().toISOString(),
                lastModifiedBy: user.username
            }, user.username);
            if (onUpdate) onUpdate();
        }
    };

    const handleUpdate = async (id, newContent) => {
        const detail = details.find(d => d.id === id);
        if (!detail) return;

        await updateDetail({
            ...detail,
            content: newContent
        }, user.username);

        // Update parent section timestamp
        await addSection({
            ...section,
            lastModified: new Date().toISOString(),
            lastModifiedBy: user.username
        }, user.username);

        if (onUpdate) onUpdate();

        setEditingId(null);
    };

    return (
        <div className="flex flex-col gap-6" style={{ height: '100%' }}>
            <div className="flex justify-between items-center px-2">
                <h3 className="text-xl font-bold flex items-center gap-2">
                    <History className="text-[hsl(var(--primary))]" /> Activity & History
                </h3>
            </div>

            {/* Debug Logs Overlay */}
            {debugLogs.length > 0 && (
                <div className="mx-2 p-2 bg-black/80 text-green-400 text-xs font-mono rounded overflow-y-auto max-h-[100px] border border-green-900 shadow-sm">
                    <div className="flex justify-between items-center border-b border-green-800 pb-1 mb-1 sticky top-0 bg-black/80">
                        <span className="font-bold">Debug Logs</span>
                        <button onClick={() => setDebugLogs([])} className="text-red-400 hover:text-red-300">Clear</button>
                    </div>
                    {debugLogs.map((log, i) => (
                        <div key={i} className="whitespace-nowrap">{log}</div>
                    ))}
                </div>
            )}

            {/* Timeline List (Oldest to Newest) */}
            <div className="timeline" style={{ flex: 1, overflowY: 'auto', minHeight: '200px', maxHeight: '60vh' }}>
                {details.map((detail) => (
                    <div key={detail.id} className="timeline-item">
                        <div className="timeline-dot"></div>
                        <HistoryItem
                            detail={detail}
                            isEditing={editingId === detail.id}
                            transcribeAudio={transcribeAudio}
                            modelProgress={modelProgress}
                            onEditStart={() => setEditingId(detail.id)}
                            onEditCancel={() => setEditingId(null)}
                            onEditSave={(content) => handleUpdate(detail.id, content)}
                            onDelete={() => handleDelete(detail.id)}
                            onImageClick={(src) => setLightboxSrc(src)}
                        />
                    </div>
                ))}
                {details.length === 0 && (
                    <div className="timeline-item opacity-50">
                        <div className="timeline-dot bg-[hsl(var(--muted))]"></div>
                        <div className="pl-4 pt-1">No history yet.</div>
                    </div>
                )}
                {/* Invisible element to scroll to bottom */}
                <div ref={endOfListRef} />
            </div>

            {/* Main Editor (Now at Bottom) */}
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-sm overflow-hidden mt-auto">
                <div
                    ref={editorRef}
                    className="editor-input empty:before:content-[attr(placeholder)]"
                    contentEditable
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
                <div className="flex items-center justify-between p-2 bg-[hsl(var(--muted)/0.3)] border-t border-[hsl(var(--border))]">
                    <div className="flex gap-2 items-center">
                        {/* Camera Input (Direct) */}
                        <input
                            type="file"
                            ref={cameraInputRef}
                            accept="image/*"
                            capture="environment"
                            className="hidden"
                            onChange={handleImageSelect}
                        />
                        {/* Gallery Input (No Capture) */}
                        <input
                            type="file"
                            ref={galleryInputRef}
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageSelect}
                        />

                        <button
                            className="btn btn-ghost p-2 hover:bg-[hsl(var(--accent))]"
                            title="Take Photo"
                            onClick={() => cameraInputRef.current?.click()}
                        >
                            <Camera size={18} />
                        </button>

                        <button
                            className="btn btn-ghost p-2 hover:bg-[hsl(var(--accent))]"
                            title="Upload from Gallery"
                            onClick={() => galleryInputRef.current?.click()}
                        >
                            <LucideImage size={18} />
                        </button>

                        <button
                            className={`btn p-2 ${voiceStatus === 'recording' ? 'text-red-500 animate-pulse' : 'btn-ghost hover:bg-[hsl(var(--accent))]'}`}
                            title={voiceStatus === 'recording' ? "Stop Recording" : "Record Audio"}
                            onClick={handleToggleRecording}
                        >
                            {voiceStatus === 'recording' ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
                        </button>
                        {voiceStatus === 'recording' && <span className="text-xs text-red-500 font-medium">Recording...</span>}
                        {voiceStatus === 'transcribing' && <span className="text-xs text-blue-500 font-medium animate-pulse">Processing...</span>}
                    </div>

                    <button onClick={handleSaveNew} className="btn btn-primary px-4 py-1.5 text-sm" disabled={voiceStatus === 'recording'}>
                        <Save size={16} /> Add Note
                    </button>
                </div>
            </div>

            {/* Image Lightbox Popup */}
            {lightboxSrc && (
                <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
            )}
        </div>
    );
};

// Subcomponent for individual history items to handle edit state
const HistoryItem = ({ detail, isEditing, transcribeAudio, modelProgress, onEditStart, onEditCancel, onEditSave, onDelete, onImageClick }) => {
    const itemRef = useRef(null);
    const [selectedImg, setSelectedImg] = useState(null);
    const [isTranscribing, setIsTranscribing] = useState(false);

    // WHISPER_SENTINEL_RE for internal filtering
    const WHISPER_SENTINEL_RE = /^\s*(\[BLANK_AUDIO\]|\[SILENCE\]|\[ Silence \]|no speech detected\.?|\(no speech\)|\.)?\s*$/i;

    const hasAudio = detail.content.includes('<audio');
    const isStuck = detail.content.includes('Processing transcript');
    const hasTranscript = (detail.content.includes('<details') || detail.content.includes('no speech transcript')) && !isStuck;

    const handleTranscribe = async () => {
        if (isTranscribing) return;

        // Find the audio source in the HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(detail.content, 'text/html');
        const audioEl = doc.querySelector('audio');
        if (!audioEl || !audioEl.src) {
            alert("No audio source found in this note.");
            return;
        }

        setIsTranscribing(true);
        try {
            // Convert data URL back to blob
            const res = await fetch(audioEl.src);
            const blob = await res.blob();

            const text = await transcribeAudio(blob);
            const rawText = text ?? '';
            const cleanText = WHISPER_SENTINEL_RE.test(rawText.trim()) ? '' : rawText.trim();

            const transcriptHtml = cleanText
                ? `
                    <details open style="margin-top: 0.5rem; border: 1px solid hsl(var(--border)); padding: 0.5rem; border-radius: 4px; background: hsl(var(--card));">
                        <summary style="cursor: pointer; font-weight: bold; font-size: 0.8rem; color: hsl(var(--muted-foreground)); user-select: none;">Transcript</summary>
                        <div style="margin-top: 0.5rem; white-space: pre-wrap; font-size: 0.9rem; color: hsl(var(--foreground)); line-height: 1.5;">${cleanText}</div>
                    </details>
                `
                : `<div style="font-size: 0.75rem; color: hsl(var(--muted-foreground)); margin-top: 0.25rem; font-style: italic;">(audio recorded — no speech transcript)</div>`;

            // Strip old markers if present
            let baseContent = detail.content;
            if (isStuck) {
                // Remove the processing div and the placeholder ID div if present
                baseContent = baseContent.replace(/<div[^>]*?>\s*(<span[^>]*?>)?Processing transcript\.{3}(<\/span>)?\s*<\/div>/gi, '');
                // Also remove any empty audio-note-containers or clean them up
                // (Optional but safer to just append to baseContent and let user edit)
            }

            // Append to content
            const newContent = baseContent + transcriptHtml;
            await onEditSave(newContent);
        } catch (err) {
            console.error("Manual transcription failed:", err);
            alert("Transcription failed: " + err.message);
        } finally {
            setIsTranscribing(false);
        }
    };

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
        <div className={`timeline-content ${isEditing ? 'ring-2 ring-[hsl(var(--primary))]' : ''}`}>
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-[hsl(var(--border)/0.5)]">
                <div className="flex items-center gap-2">
                    <span className="timeline-date">
                        {new Date(detail.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    {(detail.id.toString().startsWith('temp-') || detail.status === 'sending') && (
                        <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1 rounded flex items-center gap-1">
                            Sending...
                        </span>
                    )}
                </div>

                <div className="flex gap-1 opacity-0 hover:opacity-100 transition-opacity group-hover:opacity-100">
                    {isEditing ? (
                        <>
                            <button onClick={() => onEditSave(itemRef.current.innerHTML)} className="btn btn-ghost p-1 text-green-600 hover:text-green-700 hover:bg-green-50">
                                <Check size={14} />
                            </button>
                            <button onClick={onEditCancel} className="btn btn-ghost p-1 text-red-600 hover:text-red-700 hover:bg-red-50">
                                <X size={14} />
                            </button>
                        </>
                    ) : (
                        <>
                            {hasAudio && !hasTranscript && (
                                <button
                                    onClick={handleTranscribe}
                                    disabled={isTranscribing}
                                    className="btn btn-ghost p-1 text-blue-500 hover:text-blue-600 flex items-center gap-1 text-[10px] font-bold"
                                    title="Transcribe Audio"
                                >
                                    {isTranscribing ? (
                                        <>
                                            <RefreshCw size={12} className="animate-spin" />
                                            {modelProgress !== null && modelProgress < 100 ? `${modelProgress}%` : '...'}
                                        </>
                                    ) : (
                                        "✨ Transcribe"
                                    )}
                                </button>
                            )}
                            <button onClick={onEditStart} className="btn btn-ghost p-1 text-muted hover:text-[hsl(var(--foreground))]" title="Edit">
                                <Edit3 size={14} />
                            </button>
                            <button onClick={onDelete} className="btn btn-ghost p-1 text-muted hover:text-destructive" title="Delete">
                                <Trash2 size={14} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {isEditing ? (
                <div className="relative">
                    <div
                        ref={itemRef}
                        className="min-h-[60px] p-2 outline-none bg-[hsl(var(--background))] rounded-md"
                        contentEditable
                        onClick={handleClick}
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
                <div
                    className="ql-editor prose prose-sm max-w-none dark:prose-invert"
                    dangerouslySetInnerHTML={{ __html: detail.content }}
                    onClick={(e) => {
                        if (e.target.tagName === 'IMG') {
                            e.preventDefault();
                            onImageClick(e.target.src);
                        }
                    }}
                    style={{ cursor: 'default' }}
                />
            )}
        </div>
    );
};

export default DetailEditor;
