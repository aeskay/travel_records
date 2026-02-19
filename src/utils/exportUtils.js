import { utils, writeFile } from 'xlsx';
import { getDetails } from '../db';

/**
 * Export sections and their details to an Excel file.
 * @param {Array} sections - List of section objects
 * @param {string} username - Current username for fetching details
 */
export const exportToExcel = async (sections, username) => {
    console.log("Starting Excel export for", sections.length, "sections");
    try {
        // Ensure sections is always an array
        const sectionList = Array.isArray(sections) ? sections : [sections];

        // Prepare data for Excel
        // We will create two sheets: "Sections" and "Notes"

        // Sheet 1: Sections
        const sectionsData = sectionList.map(s => ({
            ID: s.id,
            Type: s.type || 'Uncategorized',
            Status: s.status || 'Pending',
            Highway: s.highway || '',
            District: s.district || '',
            City: s.city || '',
            County: s.county || '',
            GPS: s.coordinates || '',
            'Evaluated At': s.evaluatedAt ? new Date(s.evaluatedAt).toLocaleString() : '',
            'Last Modified': s.lastModified ? new Date(s.lastModified).toLocaleString() : '',
            'Modified By': s.lastModifiedBy || ''
        }));

        console.log("Prepared section data");

        // Sheet 2: Notes/Details
        // We need to fetch details for all sections
        const allNotes = [];

        await Promise.all(sectionList.map(async (section) => {
            try {
                // If username is not provided, this might fail depending on db implementation
                // But typically read access might be open or require just valid auth
                const details = await getDetails(section.id, username);
                if (details && Array.isArray(details)) {
                    details.forEach(detail => {
                        // Strip HTML from content for Excel readability
                        const tempDiv = document.createElement('div');
                        tempDiv.innerHTML = detail.content;
                        const textContent = tempDiv.textContent || tempDiv.innerText || '';

                        const MAX_CELL_LENGTH = 32000;
                        const safeContent = textContent.length > MAX_CELL_LENGTH
                            ? textContent.substring(0, MAX_CELL_LENGTH) + '...[TRUNCATED]'
                            : textContent;
                        const safeHtml = detail.content.length > MAX_CELL_LENGTH
                            ? detail.content.substring(0, MAX_CELL_LENGTH) + '...[TRUNCATED]'
                            : detail.content;

                        allNotes.push({
                            'Section ID': section.id,
                            Timestamp: new Date(detail.timestamp).toLocaleString(),
                            Content: safeContent,
                            'Original HTML': safeHtml
                        });
                    });
                }
            } catch (err) {
                console.warn(`Failed to fetch details for ${section.id}`, err);
            }
        }));

        console.log("Fetched notes:", allNotes.length);

        // Create workbook and worksheets
        const wb = utils.book_new();

        const wsSections = utils.json_to_sheet(sectionsData);
        utils.book_append_sheet(wb, wsSections, "Sections");

        if (allNotes.length > 0) {
            const wsNotes = utils.json_to_sheet(allNotes);
            utils.book_append_sheet(wb, wsNotes, "Notes");
        }

        // Generate filename
        const filename = sectionList.length === 1
            ? `Trip_Plan_${sectionList[0].id}.xlsx`
            : `Trip_Plan_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;

        console.log("Writing file:", filename);

        // Download
        writeFile(wb, filename);
        console.log("Export complete");

    } catch (error) {
        console.error("Export failed:", error);
        alert("Export failed. See console for details.");
    }
};
