import Papa from 'papaparse';
import { getSections } from '../db';

// Helper to calculate distance between two coordinates in meters
const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

const PARSE_OPTIONS = {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
};

// Helper to find value by fuzzy header match
const getValue = (row, ...possibleHeaders) => {
    // Normalize: lowercase and remove non-alphanumeric characters
    const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';
    const targets = possibleHeaders.map(normalize);

    for (const key in row) {
        if (targets.includes(normalize(key))) {
            return row[key] ? row[key].trim() : '';
        }
    }
    return '';
};

export const parseCSV = (file) => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            ...PARSE_OPTIONS,
            complete: (results) => {
                const rawRows = results.data;
                const mappedSections = [];

                // Known field mappings: csv header variants -> internal field name
                const knownMappings = [
                    { field: 'id', headers: ['Section ID', 'ID', 'SectionId'] },
                    { field: 'type', headers: ['Section Type', 'Section Data Type', 'Type', 'DataType'] },
                    { field: 'highway', headers: ['Highway', 'Hwy'] },
                    { field: 'district', headers: ['District'] },
                    { field: 'county', headers: ['County'] },
                    { field: 'city', headers: ['City'] },
                    { field: 'coordinates', headers: ['GPS Coordinates', 'GPS', 'Coordinates', 'LatLong'] },
                    { field: 'maintenance_section', headers: ['Maintenance Section', 'Maint Section', 'Maintenance'] },
                    { field: 'limits', headers: ['Limits', 'Limit'] },
                    { field: 'test_sequence', headers: ['Test Sequence', 'TestSequence', 'Sequence'] },
                ];

                const normalize = (str) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

                for (const row of rawRows) {
                    const section = {};
                    const matchedCsvKeys = new Set();

                    // Map known fields
                    for (const mapping of knownMappings) {
                        const targets = mapping.headers.map(normalize);
                        for (const key in row) {
                            if (targets.includes(normalize(key))) {
                                section[mapping.field] = row[key] ? row[key].trim() : '';
                                matchedCsvKeys.add(key);
                                break;
                            }
                        }
                    }

                    if (!section.id) continue; // Skip rows without ID
                    section.id = String(section.id);
                    if (!section.type) section.type = 'Uncategorized';

                    // Capture any extra/unknown columns as additional fields
                    for (const key in row) {
                        if (!matchedCsvKeys.has(key)) {
                            const snakeKey = key.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                            if (snakeKey && row[key] && row[key].trim()) {
                                section[snakeKey] = row[key].trim();
                            }
                        }
                    }

                    // Don't set status or details here — preserve existing if merging
                    if (!section.status) section.status = 'Not Evaluated';

                    mappedSections.push(section);
                }

                resolve({ sections: mappedSections });
            },
            error: (error) => reject(error),
        });
    });
};

export const analyzeImport = async (parsedData, username) => {
    const sectionsToAnalyze = Array.isArray(parsedData) ? parsedData : (parsedData.sections || []);

    const existingSections = await getSections(username);
    const report = {
        newOrUpdates: [],      // Completely new sections
        mergeable: [],         // Existing sections with new field data to merge
        duplicates: [],        // Exact duplicates (no new data)
        errors: [],
    };

    for (const section of sectionsToAnalyze) {
        const existingById = existingSections.find(s => s.id === section.id);

        if (existingById) {
            // Check if the incoming section has any new or changed fields
            const newFields = {};
            for (const key in section) {
                if (key === 'status' || key === 'details') continue; // Don't overwrite status or details
                const existingVal = existingById[key];
                const newVal = section[key];
                if (newVal && newVal !== existingVal) {
                    newFields[key] = newVal;
                }
            }

            // Remove fields that are the same
            const meaningfulNewFields = Object.keys(newFields).filter(k => k !== 'id');

            if (meaningfulNewFields.length > 0) {
                report.mergeable.push({
                    newSection: section,
                    existingSection: existingById,
                    newFields: newFields,
                    fieldNames: meaningfulNewFields
                });
            } else {
                report.duplicates.push({
                    newSection: section,
                    existingSection: existingById,
                    reason: 'Identical — no new data'
                });
            }
        } else {
            // Check for coordinate proximity clash
            let lat, lon;
            if (section.coordinates) {
                const parts = section.coordinates.split(',').map(s => parseFloat(s.trim()));
                if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                    lat = parts[0];
                    lon = parts[1];
                }
            }

            let nearbySection = null;
            if (lat && lon) {
                const thresholdMeters = 50;
                for (const ex of existingSections) {
                    if (ex.coordinates) {
                        const exParts = ex.coordinates.split(',').map(s => parseFloat(s.trim()));
                        if (exParts.length === 2) {
                            const dist = getDistanceFromLatLonInMeters(lat, lon, exParts[0], exParts[1]);
                            if (dist < thresholdMeters) {
                                nearbySection = ex;
                                break;
                            }
                        }
                    }
                }
            }

            if (nearbySection) {
                report.duplicates.push({
                    newSection: section,
                    existingSection: nearbySection,
                    reason: 'Similar coordinates'
                });
            } else {
                report.newOrUpdates.push(section);
            }
        }
    }

    return report;
};
