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

        const options = {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 10000
        };

        const watchId = navigator.geolocation.watchPosition(
            (position) => {
                setLocation(position);
                setError(null);
            },
            (err) => {
                setError(err);
            },
            options
        );

        return () => {
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
