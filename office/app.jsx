/* app.jsx — Pilot shell: switches between Office / Agents / Projects / Settings. */
const { BoardView, AgentsView, ProjectsView, SettingsView } = window;

function App() {
  const [tab, setTab] = React.useState('Office');
  const [accent, setAccent] = React.useState('#0A84FF');

  if (tab === 'Agents')   return <AgentsView   tab={tab} onNav={setTab} />;
  if (tab === 'Projects') return <ProjectsView tab={tab} onNav={setTab} />;
  if (tab === 'Settings') return <SettingsView tab={tab} onNav={setTab} accent={accent} setAccent={setAccent} />;
  return <BoardView width="100%" accent={accent} tab={tab} onNav={setTab} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
