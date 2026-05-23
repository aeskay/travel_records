import { createContext, useState, useContext, useEffect } from 'react';

const LocationContext = createContext();

export const LocationProvider = ({ children }) => {
    const [location, setLocation] = useState(null);
    const [error, setError] = useState(null);
    const [isSupported, setIsSupported] = useState(true);

    useEffect(() => {
        if (!navigator.geolocation) {
            setIsSupported(false);
            return;
        }

        console.log("[LocationProvider] Starting global high-accuracy GPS tracking...");
        
        const options = {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        };

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                setLocation(position);
                setError(null);
                console.log(`[LocationProvider] Global GPS update. Lat: ${position.coords.latitude.toFixed(7)}, Lng: ${position.coords.longitude.toFixed(7)}, Accuracy: ${position.coords.accuracy.toFixed(1)}m`);
            },
            (err) => {
                console.warn("[LocationProvider] Global GPS tracking error:", err);
                setError(err);
            },
            options
        );

        return () => {
            console.log("[LocationProvider] Stopping global GPS tracking.");
            navigator.geolocation.clearWatch(watchId);
        };
    }, []);

    return (
        <LocationContext.Provider value={{ location, error, isSupported }}>
            {children}
        </LocationContext.Provider>
    );
};

export const useLocation = () => useContext(LocationContext);
