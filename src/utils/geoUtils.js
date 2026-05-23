/**
 * High-accuracy Geolocation Utility
 * 
 * Standard navigator.geolocation.getCurrentPosition can be slow to warm up the GPS
 * sensor, causing it to return inaccurate cached or cell-tower coordinates (often off by
 * 30-100+ meters) before it obtains a true GPS satellite lock.
 * 
 * This utility uses watchPosition to keep the GPS active, tracking multiple location
 * updates as accuracy improves, and resolves immediately once the desired accuracy
 * (e.g. < 10 meters) is achieved. It also features a fallback timeout to resolve with
 * the best available coordinate if desired accuracy isn't reached within the window.
 */

export const getAccurateCurrentPosition = (options = {}) => {
    return new Promise((resolve, reject) => {
        let watchId;
        let timer;
        
        const defaultOptions = {
            enableHighAccuracy: true,
            timeout: 15000,      // Allow up to 15 seconds for GPS to warm up and get a lock
            maximumAge: 0,       // Force fresh coordinates (no cached)
            desiredAccuracy: 10,  // Target accuracy in meters (standard GPS is ~3-5m)
        };
        
        const mergedOptions = { ...defaultOptions, ...options };
        let bestPosition = null;

        const onSuccess = (position) => {
            const accuracy = position.coords.accuracy;
            console.log(`[Geolocation] Update received. Accuracy: ${accuracy}m`);

            // Track the most accurate position so far
            if (!bestPosition || accuracy < bestPosition.coords.accuracy) {
                bestPosition = position;
            }

            // If accuracy is within our desired threshold, resolve immediately!
            if (accuracy <= mergedOptions.desiredAccuracy) {
                cleanup();
                resolve(position);
            }
        };

        const onError = (error) => {
            console.warn("[Geolocation] Error during watch:", error);
            // If we have already received at least one coordinate, resolve with the best one
            if (bestPosition) {
                cleanup();
                resolve(bestPosition);
            } else {
                cleanup();
                reject(error);
            }
        };

        const cleanup = () => {
            if (watchId !== undefined) {
                navigator.geolocation.clearWatch(watchId);
            }
            if (timer) {
                clearTimeout(timer);
            }
        };

        // Fallback timer: if we timeout before reaching desired accuracy,
        // resolve with the best coordinate found so far.
        timer = setTimeout(() => {
            cleanup();
            if (bestPosition) {
                console.log(`[Geolocation] Timeout reached. Resolving with best position found (Accuracy: ${bestPosition.coords.accuracy}m)`);
                resolve(bestPosition);
            } else {
                reject(new Error("Timeout obtaining highly accurate location"));
            }
        }, mergedOptions.timeout);

        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by this browser"));
            return;
        }

        // Start watching position to let GPS warm up and settle
        watchId = navigator.geolocation.watchPosition(onSuccess, onError, mergedOptions);
    });
};
