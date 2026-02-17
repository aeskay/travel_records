import { useState, useEffect, useMemo, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import SectionDetail from './components/SectionDetail';
import ImportModal from './components/ImportModal';
import ManualAddModal from './components/ManualAddModal';
import LoginScreen from './components/LoginScreen';
import SettingsView from './components/SettingsView';
import { getSections, addSections, addSection, getDetails, addDetail } from './db';
import { parseCSV } from './utils/csvImporter';
import { UserProvider, useUser } from './context/UserContext';
import './styles/App.css';

function AppContent() {
  const { user, loading } = useUser();
  const [sections, setSections] = useState([]);
  const [selectedSection, setSelectedSection] = useState(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [filterType, setFilterType] = useState('all'); // all, evaluated, remaining
  const [currentView, setCurrentView] = useState('dashboard'); // dashboard, settings
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 768);

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

  const handleImport = async (file) => {
    if (!user) return;
    try {
      const parsedData = await parseCSV(file);
      await addSections(parsedData.sections, user.username);
      loadSections();
      setIsImportModalOpen(false);
    } catch (error) {
      console.error("Import failed:", error);
      alert("Import failed: " + error.message);
    }
  };

  const filteredSections = useMemo(() => {
    if (filterType === 'evaluated') return sections.filter(s => s.status === 'Evaluated');
    if (filterType === 'remaining') return sections.filter(s => s.status !== 'Evaluated');
    return sections;
  }, [sections, filterType]);

  const counts = useMemo(() => {
    const evaluated = sections.filter(s => s.status === 'Evaluated').length;
    return {
      all: sections.length,
      evaluated,
      remaining: sections.length - evaluated
    };
  }, [sections]);

  if (loading) return <div className="loading-screen">Loading...</div>;
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
      />

      <main className="main-content">
        {currentView === 'settings' ? (
          <SettingsView onClose={() => setCurrentView('dashboard')} />
        ) : (
          selectedSection ? (
            <SectionDetail
              section={selectedSection}
              onStatusChange={() => loadSections()}
            />
          ) : (
            <div className="empty-state">
              <h2>Select a Section</h2>
              <p>Choose a section from the sidebar to view details.</p>
            </div>
          )
        )}
      </main>

      {isImportModalOpen && (
        <ImportModal
          onClose={() => setIsImportModalOpen(false)}
          onImport={handleImport}
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
