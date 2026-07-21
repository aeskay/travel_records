import { useState, useEffect, useCallback, useRef } from 'react';
import { getDetails, addDetail, updateDetail, deleteDetail, addSection, subscribeToDetails } from '../db';
import { getAccurateCurrentPosition } from '../utils/geoUtils';
import { fetchWeather, formatWeatherString } from '../utils/weatherUtils';
import { History, Save, Edit3, Camera, Mic, X, Image as LucideImage, Square, Trash2, Check, RotateCcw, RefreshCw, Bold, Italic, Underline, Link, List, ListOrdered, RemoveFormatting, Strikethrough } from 'lucide-react';
import ImageResizer from './ImageResizer';
import ImageLightbox from './ImageLightbox';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { useVoiceLogger } from '../hooks/useVoiceLogger';
import { useLocation } from '../context/LocationContext';

const DetailEditor = ({ section, onUpdate }) => {
    const { user } = useUser();
    const { showAlert, showConfirm } = useNotification();
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

    const { location: globalLocation } = useLocation();

    // Background GPS tracking and interaction-based snapshotting
    const latestPosRef = useRef(null);
    const capturePosRef = useRef(null);
    const isInteractingRef = useRef(false);

    const recordCaptureLocation = useCallback(() => {
        isInteractingRef.current = true;
        if (latestPosRef.current) {
            // Snapshot location on interaction, or upgrade it if the new one is more accurate
            if (!capturePosRef.current || latestPosRef.current.coords.accuracy < capturePosRef.current.coords.accuracy) {
                capturePosRef.current = latestPosRef.current;
                console.log("[DetailEditor] Snapshotted location at interaction:", latestPosRef.current.coords.latitude, latestPosRef.current.coords.longitude, `Accuracy: ${latestPosRef.current.coords.accuracy}m`);
            }
        }
    }, []);

    // Sync global location updates into the interaction ref
    useEffect(() => {
        if (globalLocation) {
            latestPosRef.current = globalLocation;
            
            // If user is currently interacting (writing a note, recording audio, taking a photo),
            // continuously upgrade our captured coordinates with any better-accuracy updates
            // received from the global GPS context while they work!
            if (isInteractingRef.current) {
                if (!capturePosRef.current || globalLocation.coords.accuracy < capturePosRef.current.coords.accuracy) {
                    capturePosRef.current = globalLocation;
                    console.log(`[DetailEditor] GPS settled further (global). Auto-upgraded captured position accuracy to: ${globalLocation.coords.accuracy}m`);
                }
            }
        }
    }, [globalLocation]);

    // Reset interaction state when section changes
    useEffect(() => {
        capturePosRef.current = null;
        isInteractingRef.current = false;
    }, [section?.docId]);

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


    const [recordingDuration, setRecordingDuration] = useState(0);

    useEffect(() => {
        let interval;
        if (voiceStatus === 'recording') {
            setRecordingDuration(0);
            interval = setInterval(() => {
                setRecordingDuration(prev => prev + 1);
            }, 1000);
        } else {
            setRecordingDuration(0);
        }
        return () => clearInterval(interval);
    }, [voiceStatus]);

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

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
                showAlert("Recording failed to stop properly.");
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
        recordCaptureLocation();
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


    const handleSaveNew = async () => {
        // Remove isSaving check to allow multiple sends
        if (!editorRef.current || !user) return;
        let content = editorRef.current.innerHTML;

        const hasText = editorRef.current.textContent.trim().length > 0;
        const hasMedia = content.includes('<img') || content.includes('<audio');
        if (!hasText && !hasMedia) return;

        setIsSaving(true);
        try {
            let currentCoords = null;
            let geoError = false;
            let weatherStr = null;
            try {
                // Use the location snapshotted at the first interaction (typing, voice button, camera button),
                // otherwise fallback to the latest background coordinate.
                let position = capturePosRef.current || latestPosRef.current;
                
                // If no background position was received yet, fetch a quick, fresh one.
                if (!position) {
                    position = await getAccurateCurrentPosition({ timeout: 5000 });
                }

                const lat = position.coords.latitude.toFixed(7);
                const lng = position.coords.longitude.toFixed(7);
                const accuracy = position.coords.accuracy ? ` (±${position.coords.accuracy.toFixed(1)}m)` : '';
                currentCoords = `${lat}, ${lng}${accuracy}`;

                // Fetch weather concurrently with coordinate formatting (both use same position)
                const [weatherResult] = await Promise.allSettled([
                    fetchWeather(position.coords.latitude, position.coords.longitude)
                ]);
                if (weatherResult.status === 'fulfilled' && weatherResult.value) {
                    weatherStr = formatWeatherString(weatherResult.value);
                }
            } catch (err) {
                console.warn("Could not get live location:", err);
                geoError = true;
            }

            if (geoError || !currentCoords) {
                const proceed = await showConfirm("Live GPS coordinates unavailable. Continue saving without coordinates?");
                if (!proceed) {
                    setIsSaving(false);
                    return;
                }
                currentCoords = "No GPS Coordinates";
            }

            const timestamp = new Date();
            const weatherLine = weatherStr
                ? `<div style="font-size: 0.8rem; color: hsl(var(--muted-foreground)); margin-top: 0.2rem;">🌤 ${weatherStr}</div>`
                : '';
            const header = `
                <div style="font-size: 0.85rem; color: hsl(var(--muted-foreground)); margin-bottom: 0.5rem; border-bottom: 1px solid hsl(var(--border)); padding-bottom: 0.25rem;">
                    <strong>${user.username}</strong> • Coords: ${currentCoords}
                    ${weatherLine}
                </div>
            `;

            // If content is too large for Firestore, alert the user to prevent silent data loss
            if (new Blob([header + content]).size > 950_000) {
                if (showAlert) showAlert("Note is too large to save! Please delete some images or audio to stay under the 1MB limit.", "error");
                setIsSaving(false);
                return;
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
            capturePosRef.current = null; // Reset snapshot for the next note
            isInteractingRef.current = false; // Reset interaction state

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
            showAlert("Failed to save note: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (await showConfirm("Are you sure you want to delete this note?")) {
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

    const handleUpdate = async (detailToUpdate, newContent) => {
        if (!detailToUpdate) return;

        await updateDetail({
            ...detailToUpdate,
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
                            onEditSave={(content) => handleUpdate(detail, content)}
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
            <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg shadow-sm overflow-hidden mt-auto flex flex-col">
                {/* Rich Text Toolbar */}
                <div className="rich-text-toolbar">
                    <button
                        type="button"
                        className="rich-text-btn"
                        title="Bold"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            document.execCommand('bold', false, null);
                        }}
                    >
                        <Bold size={16} />
                    </button>
                    <button
                        type="button"
                        className="rich-text-btn"
                        title="Italic"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            document.execCommand('italic', false, null);
                        }}
                    >
                        <Italic size={16} />
                    </button>
                    <button
                        type="button"
                        className="rich-text-btn"
                        title="Underline"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            document.execCommand('underline', false, null);
                        }}
                    >
                        <Underline size={16} />
                    </button>
                    <button
                        type="button"
                        className="rich-text-btn"
                        title="Strikethrough"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            document.execCommand('strikeThrough', false, null);
                        }}
                    >
                        <Strikethrough size={16} />
                    </button>
                    
                    <div className="rich-text-divider"></div>
                    
                    <button
                        type="button"
                        className="rich-text-btn"
                        title="Hyperlink"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            const sel = window.getSelection();
                            let savedRange = null;
                            if (sel.rangeCount > 0) {
                                savedRange = sel.getRangeAt(0);
                            }
                            const url = prompt("Enter link URL (e.g., https://example.com):");
                            if (url) {
                                if (savedRange) {
                                    sel.removeAllRanges();
                                    sel.addRange(savedRange);
                                }
                                const cleanUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
                                if (sel.isCollapsed) {
                                    const linkHtml = `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${url}</a>`;
                                    insertHtmlAtCursor(linkHtml);
                                } else {
                                    document.execCommand('createLink', false, cleanUrl);
                                    setTimeout(() => {
                                        if (editorRef.current) {
                                            const links = editorRef.current.querySelectorAll('a:not([target="_blank"])');
                                            links.forEach(link => {
                                                link.setAttribute('target', '_blank');
                                                link.setAttribute('rel', 'noopener noreferrer');
                                            });
                                        }
                                    }, 10);
                                }
                            }
                        }}
                    >
                        <Link size={16} />
                    </button>
                    
                    <div className="rich-text-divider"></div>
                    
                    <button
                        type="button"
                        className="rich-text-btn"
                        title="Bullet List"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            document.execCommand('insertUnorderedList', false, null);
                        }}
                    >
                        <List size={16} />
                    </button>
                    <button
                        type="button"
                        className="rich-text-btn"
                        title="Numbered List"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            document.execCommand('insertOrderedList', false, null);
                        }}
                    >
                        <ListOrdered size={16} />
                    </button>
                    
                    <div className="rich-text-divider"></div>
                    
                    <button
                        type="button"
                        className="rich-text-btn"
                        title="Clear Formatting"
                        onMouseDown={(e) => {
                            e.preventDefault();
                            document.execCommand('removeFormat', false, null);
                        }}
                    >
                        <RemoveFormatting size={16} />
                    </button>
                </div>

                <div
                    ref={editorRef}
                    className="editor-input empty:before:content-[attr(placeholder)] !border-0 !rounded-none focus:!ring-0 focus:!shadow-none"
                    contentEditable
                    placeholder="Add details, images, or voice notes..."
                    onClick={handleEditorClick}
                    onInput={recordCaptureLocation}
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
                            onClick={() => {
                                recordCaptureLocation();
                                cameraInputRef.current?.click();
                            }}
                        >
                            <Camera size={18} />
                        </button>

                        <button
                            className="btn btn-ghost p-2 hover:bg-[hsl(var(--accent))]"
                            title="Upload from Gallery"
                            onClick={() => {
                                recordCaptureLocation();
                                galleryInputRef.current?.click();
                            }}
                        >
                            <LucideImage size={18} />
                        </button>

                        <button
                            className={`btn p-2 ${voiceStatus === 'recording' ? 'text-red-500 animate-pulse' : 'btn-ghost hover:bg-[hsl(var(--accent))]'}`}
                            title={voiceStatus === 'recording' ? "Stop Recording" : "Record Audio"}
                            onClick={() => {
                                if (voiceStatus !== 'recording') {
                                    recordCaptureLocation();
                                }
                                handleToggleRecording();
                            }}
                        >
                            {voiceStatus === 'recording' ? <Square size={18} fill="currentColor" /> : <Mic size={18} />}
                        </button>
                        {voiceStatus === 'recording' && <span className="text-xs text-red-500 font-medium">... {formatDuration(recordingDuration)}</span>}
                        {voiceStatus === 'transcribing' && <span className="text-xs text-blue-500 font-medium animate-pulse">Processing...</span>}
                    </div>

                    <button onClick={handleSaveNew} className="btn btn-primary px-4 py-1.5 text-sm" disabled={voiceStatus === 'recording' || isSaving}>
                        {isSaving ? (
                            <>
                                <RefreshCw size={16} className="animate-spin mr-1" />
                                Acquiring GPS...
                            </>
                        ) : (
                            <>
                                <Save size={16} /> Add Note
                            </>
                        )}
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

import React from 'react';

// Subcomponent for individual history items to handle edit state
const HistoryItem = React.memo(({ detail, isEditing, transcribeAudio, modelProgress, onEditStart, onEditCancel, onEditSave, onDelete, onImageClick }) => {
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
            showAlert("No audio source found in this note.");
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
            let baseContent = detail.content.replace('Start Coords:', 'Coords:');
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
            showAlert("Transcription failed: " + err.message);
        } finally {
            setIsTranscribing(false);
        }
    };

    useEffect(() => {
        if (isEditing && itemRef.current) {
            itemRef.current.innerHTML = detail.content.replace('Start Coords:', 'Coords:');
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
                <div className="relative flex flex-col border border-[hsl(var(--border))] rounded-md overflow-hidden bg-[hsl(var(--card))]">
                    {/* Inline Formatting Toolbar */}
                    <div className="rich-text-toolbar !p-1 !border-0 !border-b !border-[hsl(var(--border))]">
                        <button
                            type="button"
                            className="rich-text-btn !p-1"
                            title="Bold"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                document.execCommand('bold', false, null);
                            }}
                        >
                            <Bold size={14} />
                        </button>
                        <button
                            type="button"
                            className="rich-text-btn !p-1"
                            title="Italic"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                document.execCommand('italic', false, null);
                            }}
                        >
                            <Italic size={14} />
                        </button>
                        <button
                            type="button"
                            className="rich-text-btn !p-1"
                            title="Underline"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                document.execCommand('underline', false, null);
                            }}
                        >
                            <Underline size={14} />
                        </button>
                        <button
                            type="button"
                            className="rich-text-btn !p-1"
                            title="Strikethrough"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                document.execCommand('strikeThrough', false, null);
                            }}
                        >
                            <Strikethrough size={14} />
                        </button>
                        
                        <div className="rich-text-divider !h-4 !mx-0.5"></div>
                        
                        <button
                            type="button"
                            className="rich-text-btn !p-1"
                            title="Hyperlink"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                const sel = window.getSelection();
                                let savedRange = null;
                                if (sel.rangeCount > 0) {
                                    savedRange = sel.getRangeAt(0);
                                }
                                const url = prompt("Enter link URL (e.g., https://example.com):");
                                if (url) {
                                    if (savedRange) {
                                        sel.removeAllRanges();
                                        sel.addRange(savedRange);
                                    }
                                    const cleanUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
                                    if (sel.isCollapsed) {
                                        const linkHtml = `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${url}</a>`;
                                        document.execCommand('insertHTML', false, linkHtml);
                                    } else {
                                        document.execCommand('createLink', false, cleanUrl);
                                        setTimeout(() => {
                                            if (itemRef.current) {
                                                const links = itemRef.current.querySelectorAll('a:not([target="_blank"])');
                                                links.forEach(link => {
                                                    link.setAttribute('target', '_blank');
                                                    link.setAttribute('rel', 'noopener noreferrer');
                                                });
                                            }
                                        }, 10);
                                    }
                                }
                            }}
                        >
                            <Link size={14} />
                        </button>
                        
                        <div className="rich-text-divider !h-4 !mx-0.5"></div>
                        
                        <button
                            type="button"
                            className="rich-text-btn !p-1"
                            title="Bullet List"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                document.execCommand('insertUnorderedList', false, null);
                            }}
                        >
                            <List size={14} />
                        </button>
                        <button
                            type="button"
                            className="rich-text-btn !p-1"
                            title="Numbered List"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                document.execCommand('insertOrderedList', false, null);
                            }}
                        >
                            <ListOrdered size={14} />
                        </button>
                        
                        <div className="rich-text-divider !h-4 !mx-0.5"></div>
                        
                        <button
                            type="button"
                            className="rich-text-btn !p-1"
                            title="Clear Formatting"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                document.execCommand('removeFormat', false, null);
                            }}
                        >
                            <RemoveFormatting size={14} />
                        </button>
                    </div>
                    <div
                        ref={itemRef}
                        className="min-h-[80px] p-2 outline-none bg-[hsl(var(--background))] focus:!ring-0 focus:!shadow-none"
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
                    dangerouslySetInnerHTML={{ __html: detail.content.replace('Start Coords:', 'Coords:') }}
                    onClick={(e) => {
                        // Only handle image taps; do not interfere with text selection on Android
                        if (e.target.tagName === 'IMG') {
                            // Only fire if no text is currently selected (i.e. user tapped, not long-pressed to select)
                            const sel = window.getSelection();
                            if (!sel || sel.toString().length === 0) {
                                e.preventDefault();
                                onImageClick(e.target.src);
                            }
                        }
                    }}
                    style={{
                        cursor: 'text',
                        userSelect: 'text',
                        WebkitUserSelect: 'text',
                        touchAction: 'auto',
                        WebkitTouchCallout: 'default',
                    }}
                />
            )}
        </div>
    );
}, (prevProps, nextProps) => {
    // Only re-render if the specific data for this item changes
    return prevProps.detail.id === nextProps.detail.id &&
           prevProps.detail.content === nextProps.detail.content &&
           prevProps.detail.status === nextProps.detail.status &&
           prevProps.isEditing === nextProps.isEditing &&
           prevProps.modelProgress === nextProps.modelProgress;
});

export default DetailEditor;
