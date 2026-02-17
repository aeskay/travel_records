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
  const [currentView, setCurrentView] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 768);
  const [editingSection, setEditingSection] = useState(null);

  const loadSections = useCallback(async () => {
    if (!user) return;
    const data = await getSections(user.username);
    setSections(data || []);
  }, [user]);

  useEffect(() => {
    if (user) {
      loadSections();
    }
  }, [user, loadSections]);

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
    if (filterType === 'pending') return sections.filter(s => s.status !== 'Evaluated');
    if (filterType === 'excluded') return sections.filter(s => !s.test_sequence || String(s.test_sequence).trim() === '');
    return sections;
  }, [sections, filterType]);

  const counts = useMemo(() => {
    const evaluated = sections.filter(s => s.status === 'Evaluated').length;
    const excluded = sections.filter(s => !s.test_sequence || String(s.test_sequence).trim() === '').length;
    return {
      all: sections.length,
      evaluated,
      pending: sections.length - evaluated,
      excluded
    };
  }, [sections]);

  const allTypes = useMemo(() => [...new Set(sections.map(s => s.type).filter(Boolean))], [sections]);

  const handleChangeStatus = async (section, newStatus) => {
    const updated = { ...section, status: newStatus };
    await addSection(updated, user.username);
    loadSections();
  };

  const handleChangeType = async (section, newType) => {
    const updated = { ...section, type: newType };
    await addSection(updated, user.username);
    loadSections();
  };

  const handleDeleteSection = async (section) => {
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
    await addSection(updated, user.username);
    // Find all sections with sequence > removedSeq and decrement
    const toRenumber = sections
      .filter(s => s.test_sequence && Number(s.test_sequence) > removedSeq)
      .sort((a, b) => Number(a.test_sequence) - Number(b.test_sequence));
    for (const s of toRenumber) {
      await addSection({ ...s, test_sequence: String(Number(s.test_sequence) - 1) }, user.username);
    }
    loadSections();
  };

  const handleEditSection = async (updatedSection) => {
    await addSection(updatedSection, user.username);
    setEditingSection(null);
    loadSections();
  };

  if (loading) return <div className="flex h-screen items-center justify-center text-muted">Loading...</div>;
  if (!user) return <LoginScreen />;

  return (
    <div className="app-container">
      <Sidebar
        sections={filteredSections}
        onSelectSection={(s) => { setSelectedSection(s); setCurrentView('dashboard'); if (window.innerWidth < 768) setSidebarCollapsed(true); }}
        selectedSectionId={selectedSection?.id}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenManual={() => setIsManualModalOpen(true)}
        filterType={filterType}
        setFilterType={setFilterType}
        isCollapsed={sidebarCollapsed}
        toggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        counts={counts}
        onOpenSettings={() => setCurrentView('settings')}
        onOpenMap={() => setCurrentView('map')}
        allTypes={allTypes}
        onChangeStatus={handleChangeStatus}
        onChangeType={handleChangeType}
        onDeleteSection={handleDeleteSection}
        onEdit={(section) => setEditingSection(section)}
        allSections={sections}
        username={user?.username}
      />

      <main className="main-content">
        <div className="mobile-header">
          <button
            className="btn-icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            <Menu size={24} />
          </button>
          <span className="font-bold text-lg">0-7147: Travel Records</span>
        </div>

        <div className="h-full overflow-y-auto">
          {currentView === 'map' ? (
            <TripMapView
              sections={sections}
              selectedSection={selectedSection}
              onSelectSection={setSelectedSection}
              onBack={() => setCurrentView('dashboard')}
              onUpdateSection={async (updated) => {
                await addSection(updated, user.username);
                loadSections();
              }}
              onRemoveFromRoute={handleRemoveFromRoute}
            />
          ) : currentView === 'settings' ? (
            <SettingsView onClose={() => setCurrentView('dashboard')} />
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
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted text-center p-8 border-2 border-dashed border-[hsl(var(--border))] rounded-lg">
                <h2 className="text-xl font-bold mb-2 text-[hsl(var(--foreground))]">Select a Section</h2>
                <p>Choose a section from the sidebar to view details.</p>
              </div>
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
            await addSection(newSection, user.username);
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
