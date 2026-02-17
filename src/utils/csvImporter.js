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

export const parseCSV = (file) => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            ...PARSE_OPTIONS,
            complete: (results) => resolve(results.data),
            error: (error) => reject(error),
        });
    });
};

export const analyzeImport = async (parsedData) => {
    const existingSections = await getSections();
    const report = {
        newOrUpdates: [], // Valid entries
        duplicates: [], // Exact ID matches or Coordinate Clashes
        errors: [],
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

    for (const row of parsedData) {
        // Map fields
        const id = getValue(row, 'Section ID', 'ID');
        if (!id) continue; // Skip empty rows

        const type = getValue(row, 'Section Type', 'Section Data Type', 'Type') || 'Uncategorized';
        const highway = getValue(row, 'Highway');
        const district = getValue(row, 'District');
        const county = getValue(row, 'County');
        const city = getValue(row, 'City');
        const coordinates = getValue(row, 'GPS Coordinates', 'GPS', 'Coordinates');

        const section = {
            id: String(id),
            type: type,
            highway: highway,
            district: district,
            county: county,
            city: city,
            coordinates: coordinates,
            status: 'pending', // default
        };

        // Check for ID conflict (Exact update or conflict?)
        const existingById = existingSections.find(s => s.id === section.id);

        // Check for Coordinate conflict
        // Coordinates format expected: "Lat, Long"
        let lat, lon;
        if (section.coordinates) {
            const parts = section.coordinates.split(',').map(s => parseFloat(s.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                lat = parts[0];
                lon = parts[1];
            }
        }

        let duplicateReason = null;
        let similarSection = null;

        if (existingById) {
            duplicateReason = 'ID already exists';
            similarSection = existingById;
        } else if (lat && lon) {
            // Check fuzzy match on coordinates (e.g., within 50 meters)
            const thresholdMeters = 50;
            for (const ex of existingSections) {
                if (ex.coordinates) {
                    const exParts = ex.coordinates.split(',').map(s => parseFloat(s.trim()));
                    if (exParts.length === 2) {
                        const dist = getDistanceFromLatLonInMeters(lat, lon, exParts[0], exParts[1]);
                        if (dist < thresholdMeters) {
                            duplicateReason = `Similar coordinates found (${Math.round(dist)}m away)`;
                            similarSection = ex;
                            break;
                        }
                    }
                }
            }
        }

        if (duplicateReason) {
            report.duplicates.push({
                newSection: section,
                existingSection: similarSection,
                reason: duplicateReason
            });
        } else {
            report.newOrUpdates.push(section);
        }
    }

    return report;
};
