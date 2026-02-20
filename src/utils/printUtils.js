import { getDetails } from '../db';

/**
 * Generate a print-friendly HTML page for one or more sections.
 * Opens a new window and triggers print.
 */
export const printSections = async (sections, username) => {
    // 1. Deduplicate sections by docId
    const uniqueMap = new Map();
    const rawList = Array.isArray(sections) ? sections : [sections];
    rawList.forEach(s => {
        if (s && s.docId && !uniqueMap.has(s.docId)) {
            uniqueMap.set(s.docId, s);
        }
    });

    // 2. Sort sections
    // - Numerical by test_sequence if present
    // - Alphabetical by id if sequence is missing
    const sectionList = Array.from(uniqueMap.values()).sort((a, b) => {
        const seqA = a.test_sequence && String(a.test_sequence).trim() !== '' ? Number(a.test_sequence) : Infinity;
        const seqB = b.test_sequence && String(b.test_sequence).trim() !== '' ? Number(b.test_sequence) : Infinity;

        if (seqA !== seqB) {
            return seqA - seqB;
        }

        // Fallback to alphabetical ID
        return (a.id || '').localeCompare(b.id || '');
    });

    // 3. Fetch details for all sections in parallel
    const detailsMap = {};
    await Promise.all(
        sectionList.map(async (section) => {
            try {
                // Map by docId for unique lookup
                detailsMap[section.docId] = await getDetails(section.docId, username);
            } catch {
                detailsMap[section.docId] = [];
            }
        })
    );

    // 4. Build HTML pages
    const pagesHtml = sectionList.map((section, idx) => {
        const details = detailsMap[section.docId] || [];
        const pageBreak = idx > 0 ? 'page-break-before: always;' : '';

        const notesHtml = details.length > 0
            ? details.map(d => `
                <div class="note">
                    <div class="note-date">${new Date(d.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</div>
                    <div class="note-content">${d.content}</div>
                </div>
            `).join('')
            : '<p class="no-notes">No notes recorded.</p>';

        return `
            <div class="section-page" style="${pageBreak}">
                <div class="section-header">
                    <h1>${section.test_sequence ? `<span style="color: hsl(var(--primary)); margin-right: 8px;">#${section.test_sequence}</span>` : ''}${section.id}</h1>
                    <span class="badge">${section.type || 'Uncategorized'}</span>
                    <span class="status ${section.status === 'Evaluated' ? 'evaluated' : 'pending'}">${section.status || 'Pending'}</span>
                </div>
                <table class="meta-table">
                    <tr>
                        <td><strong>Highway:</strong> ${section.highway || 'N/A'}</td>
                        <td><strong>District:</strong> ${section.district || 'N/A'}</td>
                        <td><strong>City:</strong> ${section.city || 'N/A'}, ${section.county || 'N/A'}</td>
                    </tr>
                    <tr>
                        <td><strong>GPS:</strong> ${section.coordinates || 'N/A'}</td>
                    </tr>
                </table>
                <h2>Activity & Notes</h2>
                <div class="notes-container">
                    ${notesHtml}
                </div>
            </div>
        `;
    }).join('');

    const printHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Travel Records - ${sectionList.length === 1 ? sectionList[0].id : 'All Sections'}</title>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; padding: 20px; font-size: 11pt; }
            .section-page { margin-bottom: 2rem; }
            .section-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 8px; flex-wrap: wrap; }
            .section-header h1 { font-size: 18pt; font-weight: 800; }
            .badge { background: #e0f2fe; color: #0369a1; padding: 2px 10px; border-radius: 4px; font-size: 9pt; font-weight: 600; }
            .status { font-size: 9pt; font-weight: 600; padding: 2px 10px; border-radius: 4px; }
            .status.evaluated { background: #dcfce7; color: #16a34a; }
            .status.pending { background: #fef9c3; color: #ca8a04; }
            .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
            .meta-table td { padding: 6px 12px; border: 1px solid #ddd; }
            h2 { font-size: 13pt; margin-bottom: 12px; color: #333; }
            .notes-container { display: flex; flex-direction: column; gap: 12px; }
            .note { border: 1px solid #e5e5e5; border-radius: 6px; padding: 12px; background: #fafafa; }
            .note-date { font-size: 9pt; color: #666; font-weight: 600; margin-bottom: 6px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
            .note-content img { max-width: 300px; border-radius: 4px; margin: 8px 0; }
            .note-content audio { display: none; } /* Audio can't print */
            .no-notes { color: #999; font-style: italic; }
            @media print {
                body { padding: 0; }
                .section-page { page-break-inside: avoid; }
            }
        </style>
    </head>
    <body>
        ${pagesHtml}
    </body>
    </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
        printWindow.document.write(printHtml);
        printWindow.document.close();
        // Wait for images to load before printing
        printWindow.onload = () => {
            setTimeout(() => printWindow.print(), 300);
        };
    } else {
        alert('Pop-up blocked. Please allow pop-ups for this site to print.');
    }
};
