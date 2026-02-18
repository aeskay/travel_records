import React, { useState, useEffect, useMemo } from 'react';
import {
    CheckCircle,
    Clock,
    AlertCircle,
    FileText,
    Calendar,
    MapPin,
    ChevronRight,
    TrendingUp,
    Activity
} from 'lucide-react';
import { getSharedDaysPlan } from '../db';
import { useUser } from '../context/UserContext';

const StatBox = ({ label, value, color }) => (
    <div className="stat-box" style={{ borderTop: `4px solid ${color}` }}>
        <span className="stat-box-value">{value}</span>
        <span className="stat-box-label">{label}</span>
    </div>
);

const TimelineItem = ({ section, onClick }) => {
    const timeAgo = (date) => {
        const seconds = Math.floor((new Date() - new Date(date)) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + " years ago";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + " months ago";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + " days ago";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + " hours ago";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + " minutes ago";
        return Math.floor(seconds) + " seconds ago";
    };

    return (
        <div className="timeline-row" onClick={() => onClick(section)}>
            <div className="timeline-marker-col">
                <div className="timeline-dot" />
                <div className="timeline-line" />
            </div>

            <div className="timeline-body">
                <div className="timeline-header">
                    <h4 className="timeline-id">{section.id}</h4>
                    <span className="timeline-time">{timeAgo(section.lastModified)}</span>
                </div>
                <div className="timeline-desc">
                    <span>{section.highway}</span>
                    {section.city && <span className="timeline-sub"> — {section.city}</span>}
                </div>
            </div>
        </div>
    );
};

const DashboardView = ({ sections, counts, onSelectSection }) => {
    const { user } = useUser();
    const [daysPlan, setDaysPlan] = useState([]);

    useEffect(() => {
        getSharedDaysPlan().then(plan => {
            if (plan && Array.isArray(plan)) {
                setDaysPlan(plan);
            }
        });
    }, []);

    // Recent Activity (Filtered by User)
    const recentSections = useMemo(() => {
        if (!user) return [];
        return [...sections]
            .filter(s => s.lastModified && s.lastModifiedBy === user.username)
            .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
            .slice(0, 5);
    }, [sections, user]);

    return (
        <div className="dashboard-container fade-in">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <h1 className="dashboard-title">Trip Overview</h1>
                <p className="dashboard-subtitle">Track your evaluation progress and manage trip itinerary.</p>
            </div>

            {/* Stats Grid */}
            <div className="dashboard-stats-grid">
                <StatBox label="Total Sections" value={counts.all} color="#6366f1" />
                <StatBox label="Evaluated" value={counts.evaluated} color="#22c55e" />
                <StatBox label="Pending" value={counts.pending} color="#f59e0b" />
                <StatBox label="Excluded" value={counts.excluded} color="#ef4444" />
            </div>

            {/* Trip Calendar - Sequence Grid */}
            <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold">Trip Sequence</h2>

                <div className="calendar-section">
                    <div className="sequence-grid">
                        {sections
                            .filter(s => s.test_sequence && String(s.test_sequence).trim() !== '')
                            .sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence))
                            .map(section => {
                                const isEvaluated = section.status === 'Evaluated';
                                return (
                                    <div
                                        key={section.id}
                                        className={`sequence-item ${isEvaluated ? 'evaluated' : 'pending'}`}
                                        title={`#${section.test_sequence}: ${section.id} (${section.status || 'Pending'})`}
                                        onClick={() => onSelectSection(section)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        {section.test_sequence}
                                    </div>
                                );
                            })}
                    </div>
                    {sections.filter(s => s.test_sequence && String(s.test_sequence).trim() !== '').length === 0 && (
                        <div className="p-8 border border-dashed rounded-lg text-center text-muted w-full">
                            No sequenced stops found. Go to the Map view to sequence your trip.
                        </div>
                    )}
                </div>
            </div>

            {/* Recently Edited */}
            <div className="flex flex-col gap-4">
                <h2 className="text-xl font-bold">Recently Edited</h2>

                <div className="timeline-container">
                    {recentSections.length > 0 ? (
                        recentSections.map(section => (
                            <TimelineItem
                                key={section.id}
                                section={section}
                                onClick={onSelectSection}
                            />
                        ))
                    ) : (
                        <div className="no-activity">
                            No recent activity found.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DashboardView;
