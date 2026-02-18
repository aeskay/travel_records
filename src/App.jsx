import { useState, useEffect, useMemo, useCallback } from 'react';
import { Menu } from 'lucide-react';
import Sidebar from './components/Sidebar';
import SectionDetail from './components/SectionDetail';
import ImportModal from './components/ImportModal';
import ManualAddModal from './components/ManualAddModal';
import LoginScreen from './components/LoginScreen';
import SettingsView from './components/SettingsView';
import EditSectionModal from './components/EditSectionModal';
import TripMapView from './components/TripMapView';
import DashboardView from './components/DashboardView';
import ProjectSelection from './components/ProjectSelection';
import { getSections, addSections, addSection, deleteSection } from './db';
import { parseCSV } from './utils/csvImporter';
import { UserProvider, useUser } from './context/UserContext';
import './index.css';
import './styles/App.css';

function AppContent() {
  const { user, loading } = useUser();
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 768);
  const [editingSection, setEditingSection] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [currentProject, setCurrentProject] = useState(null);
  const [currentView, setCurrentView] = useState('dashboard');

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const loadSections = useCallback(async () => {
    if (!user || !currentProject) return;
    const data = await getSections(user.username, currentProject.id);
    setSections(data || []);
  }, [user, currentProject]);

  useEffect(() => {
    if (user && currentProject) {
      loadSections();
    }
  }, [user, currentProject, loadSections]);

  // Sync selectedSection with sections state to reflect updates (like status changes)
  useEffect(() => {
    if (selectedSection) {
      const updated = sections.find(s => s.id === selectedSection.id);
      if (updated && updated !== selectedSection) {
        setSelectedSection(updated);
      }
    }
  }, [sections]);

  const handleImportComplete = () => {
    loadSections();
    setIsImportModalOpen(false);
  };

  const filteredSections = useMemo(() => {
    if (filterType === 'evaluated') return sections.filter(s => s.status === 'Evaluated');
    // Pending: Not evaluated AND has a test sequence (not excluded)
    if (filterType === 'pending') return sections.filter(s => s.status !== 'Evaluated' && (s.test_sequence && String(s.test_sequence).trim() !== ''));
    if (filterType === 'excluded') return sections.filter(s => !s.test_sequence || String(s.test_sequence).trim() === '');
    return sections;
  }, [sections, filterType]);

  const counts = useMemo(() => {
    const evaluated = sections.filter(s => s.status === 'Evaluated').length;
    const excluded = sections.filter(s => !s.test_sequence || String(s.test_sequence).trim() === '').length;
    // Pending count should also exclude the "excluded" sections
    const pending = sections.filter(s => s.status !== 'Evaluated' && (s.test_sequence && String(s.test_sequence).trim() !== '')).length;
    return {
      all: sections.length,
      evaluated,
      pending,
      excluded
    };
  }, [sections]);

  const allTypes = useMemo(() => [...new Set(sections.map(s => s.type).filter(Boolean))], [sections]);

  // Admin Check
  const isAdmin = user?.email === 'samuel.alalade@ttu.edu';

  const handleChangeStatus = async (section, newStatus) => {
    if (!isAdmin) return;
    const updated = { ...section, status: newStatus };
    await addSection(updated, user.username, currentProject.id);
    loadSections();
  };

  const handleChangeType = async (section, newType) => {
    if (!isAdmin) return;
    const updated = { ...section, type: newType };
    await addSection(updated, user.username, currentProject.id);
    loadSections();
  };

  const handleDeleteSection = async (section) => {
    if (!isAdmin) {
      alert("Only administrators can delete sections.");
      return;
    }
    await deleteSection(section.id, user.username);
    if (selectedSection?.id === section.id) setSelectedSection(null);
    loadSections();
  };

  // Auto-renumber: when a section is removed from the route (sequence cleared),
  // shift all subsequent sequence numbers down to fill the gap.
  const handleRemoveFromRoute = async (section) => {
    const removedSeq = Number(section.test_sequence);
    // Clear the removed section's sequence
    const updated = { ...section, test_sequence: '' };
    await addSection(updated, user.username, currentProject.id);
    // Find all sections with sequence > removedSeq and decrement
    const toRenumber = sections
      .filter(s => s.test_sequence && Number(s.test_sequence) > removedSeq)
      .sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence));
    for (const s of toRenumber) {
      await addSection({ ...s, test_sequence: String(Number(s.test_sequence) - 1) }, user.username, currentProject.id);
    }
    loadSections();
  };

  const handleEditSection = async (updatedSection) => {
    if (!isAdmin) return;
    await addSection(updatedSection, user.username, currentProject.id);
    setEditingSection(null);
    loadSections();
  };

  const handleViewOnMap = (section) => {
    setSelectedSection(section);
    setCurrentView('map');
    if (window.innerWidth < 768) setSidebarCollapsed(true);
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-muted">Loading...</div>;
  if (!user) return <LoginScreen />;

  if (!currentProject) {
    return <ProjectSelection user={user} onSelectProject={setCurrentProject} />;
  }

  return (
    <div className="app-container">
      <Sidebar
        sections={filteredSections}
        onSelectSection={(s) => { setSelectedSection(s); setCurrentView('dashboard'); if (window.innerWidth < 768) setSidebarCollapsed(true); }}
        selectedSectionId={selectedSection?.id}
        onOpenImport={() => isAdmin && setIsImportModalOpen(true)}
        onOpenManual={() => isAdmin && setIsManualModalOpen(true)}
        filterType={filterType}
        setFilterType={setFilterType}
        isCollapsed={sidebarCollapsed}
        toggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        counts={counts}
        onOpenSettings={() => { setCurrentView('settings'); if (window.innerWidth < 768) setSidebarCollapsed(true); }}
        onOpenMap={() => { setCurrentView('map'); if (window.innerWidth < 768) setSidebarCollapsed(true); }}
        allTypes={allTypes}
        onChangeStatus={handleChangeStatus}
        onChangeType={handleChangeType}
        onDeleteSection={handleDeleteSection}
        onEdit={(section) => setEditingSection(section)}
        allSections={sections}
        username={user?.username}
        onViewOnMap={handleViewOnMap}
        isAdmin={isAdmin}
        projectName={currentProject.name}
        onSwitchProject={() => setCurrentProject(null)}
      />

      <main className="main-content">
        <div className="mobile-header">
          <div className="flex items-center gap-2">
            <button
              className="btn-icon"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              <Menu size={24} />
            </button>
            <span
              className="font-bold text-lg cursor-pointer"
              onClick={() => {
                setSelectedSection(null);
                setCurrentView('dashboard');
              }}
            >
              0-7147: Travel Records
            </span>
          </div>

          {/* Mobile Online Indicator */}
          <div style={{ background: 'hsl(var(--card))', padding: '2px 6px', borderRadius: '12px', border: '1px solid hsl(var(--border))', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
            {isOnline ? (
              <>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} />
                <span style={{ color: '#22c55e' }}>Online</span>
              </>
            ) : (
              <>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />
                <span style={{ color: '#ef4444' }}>Offline</span>
              </>
            )}
          </div>
        </div>

        <div className="h-full overflow-y-auto">
          {currentView === 'map' ? (
            <TripMapView
              sections={sections}
              selectedSection={selectedSection}
              onSelectSection={setSelectedSection}
              onBack={() => setCurrentView('dashboard')}
              onUpdateSection={async (updated) => {
                await addSection(updated, user.username, currentProject.id);
                loadSections();
              }}
              onRemoveFromRoute={handleRemoveFromRoute}
              username={user?.username}
              isAdmin={isAdmin}
            />
          ) : currentView === 'settings' ? (
            <SettingsView onClose={() => setCurrentView('dashboard')} isAdmin={isAdmin} />
          ) : (
            selectedSection ? (
              <SectionDetail
                section={selectedSection}
                onUpdate={() => loadSections()}
                allTypes={allTypes}
                onChangeStatus={handleChangeStatus}
                onChangeType={handleChangeType}
                onDeleteSection={handleDeleteSection}
                onEdit={(section) => setEditingSection(section)}
                onViewOnMap={handleViewOnMap}
                isAdmin={isAdmin}
              />
            ) : (
              <DashboardView
                sections={sections}
                counts={counts}
                onSelectSection={(s) => {
                  setSelectedSection(s);
                }}
              />
            )
          )}
        </div>
      </main>

      {isImportModalOpen && (
        <ImportModal
          onClose={() => setIsImportModalOpen(false)}
          onImportComplete={handleImportComplete}
        />
      )}

      {isManualModalOpen && (
        <ManualAddModal
          onClose={() => setIsManualModalOpen(false)}
          onComplete={async (newSection) => {
            await addSection(newSection, user.username, currentProject.id);
            loadSections();
            setIsManualModalOpen(false);
          }}
          existingTypes={sections.map(s => s.type)}
        />
      )}

      {editingSection && (
        <EditSectionModal
          section={editingSection}
          onClose={() => setEditingSection(null)}
          onSave={handleEditSection}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <UserProvider>
      <AppContent />
    </UserProvider>
  );
}

export default App;
