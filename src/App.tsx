import type { Component, JSX } from "solid-js";
import { onCleanup } from "solid-js";
import { Router, Route, useLocation, useNavigate } from "@solidjs/router";
import { AppShell, Sidebar, NavItem, NavGroup, ToastProvider } from "./components";
import { Dashboard, Analytics, Presets, Monitor, Logs, Agents, AgentProviders, Settings, CliproxyOverview, CliproxyProviders, CliproxyControlPanel, Popup } from "./pages";
import { proxyStore } from "./stores/proxyStore";
import { initConfigWatcher, cleanupConfigWatcher } from "./stores/configWatcher";

/* Simple SVG icons for nav items */
const IconDashboard = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="2" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5" />
    <rect x="11" y="2" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5" />
    <rect x="2" y="11" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5" />
    <rect x="11" y="11" width="7" height="7" rx="1.5" stroke="currentColor" stroke-width="1.5" />
  </svg>
);

const IconAnalytics = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 14.5l4-4.5 3.5 3 4-5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M3 17.5h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
);

const IconLogs = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="3" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.5" />
    <path d="M5.5 7.5l2.5 2.5-2.5 2.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M10.5 12.5h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
);

const IconMonitor = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="3" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.5" />
    <path d="M7 17h6M10 14v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
);

const IconSettings = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    <rect x="5" y="3.5" width="3" height="3" rx="1.5" fill="var(--color-surface)" stroke="currentColor" stroke-width="1.5" />
    <rect x="12" y="8.5" width="3" height="3" rx="1.5" fill="var(--color-surface)" stroke="currentColor" stroke-width="1.5" />
    <rect x="7" y="13.5" width="3" height="3" rx="1.5" fill="var(--color-surface)" stroke="currentColor" stroke-width="1.5" />
  </svg>
);

const IconAgents = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <circle cx="10" cy="7" r="3" stroke="currentColor" stroke-width="1.5" />
    <path d="M4 17c0-2.761 2.686-5 6-5s6 2.239 6 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
    <circle cx="15.5" cy="5.5" r="2" stroke="currentColor" stroke-width="1.2" />
    <circle cx="4.5" cy="5.5" r="2" stroke="currentColor" stroke-width="1.2" />
  </svg>
);

const IconCliproxy = (): JSX.Element => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <rect x="2" y="3" width="16" height="5" rx="1.5" stroke="currentColor" stroke-width="1.5" />
    <rect x="2" y="12" width="16" height="5" rx="1.5" stroke="currentColor" stroke-width="1.5" />
    <circle cx="5.5" cy="5.5" r="1" fill="currentColor" />
    <circle cx="5.5" cy="14.5" r="1" fill="currentColor" />
    <path d="M9 5.5h5M9 14.5h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
  </svg>
);

const AppLayout: Component<{ children?: JSX.Element }> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Cleanup proxy event listener on unmount
  onCleanup(() => proxyStore.cleanup());

  // Global keyboard shortcuts
  const handleKeydown = (e: KeyboardEvent) => {
    // Cmd+, → Settings
    if (e.metaKey && e.key === ",") {
      e.preventDefault();
      navigate("/settings");
    }
    // Cmd+N → New preset (navigate to presets page - the modal is page-level)
    if (e.metaKey && e.key === "n") {
      e.preventDefault();
      navigate("/agents/presets");
    }
  };

  document.addEventListener("keydown", handleKeydown);
  onCleanup(() => document.removeEventListener("keydown", handleKeydown));

  // Config file watcher
  initConfigWatcher();
  onCleanup(() => cleanupConfigWatcher());

  const sidebar = (
    <Sidebar proxyStatus={proxyStore.status()} proxyPort={proxyStore.port()}>
      <nav class="flex flex-col gap-1 px-2">
        <NavItem
          icon={<IconDashboard />}
          label="Dashboard"
          active={location.pathname === "/"}
          onClick={() => navigate("/")}
        />
        <NavItem
          icon={<IconAnalytics />}
          label="Analytics"
          active={location.pathname === "/analytics"}
          onClick={() => navigate("/analytics")}
        />
        <NavItem
          icon={<IconMonitor />}
          label="Monitor"
          active={location.pathname === "/monitor"}
          onClick={() => navigate("/monitor")}
        />
        <NavItem
          icon={<IconLogs />}
          label="Logs"
          active={location.pathname === "/logs"}
          onClick={() => navigate("/logs")}
        />
        <NavGroup
          icon={<IconCliproxy />}
          label="CLIProxy"
          defaultOpen={location.pathname.startsWith("/cliproxy")}
        >
          <NavItem
            label="Overview"
            active={location.pathname === "/cliproxy"}
            onClick={() => navigate("/cliproxy")}
          />
          <NavItem
            label="AI Providers"
            active={location.pathname === "/cliproxy/providers"}
            onClick={() => navigate("/cliproxy/providers")}
          />
          <NavItem
            label="Control Panel"
            active={location.pathname === "/cliproxy/control-panel"}
            onClick={() => navigate("/cliproxy/control-panel")}
          />
        </NavGroup>
        <NavGroup
          icon={<IconAgents />}
          label="Agents"
          defaultOpen={location.pathname.startsWith("/agents")}
        >
          <NavItem
            label="Configure"
            active={location.pathname === "/agents" || location.pathname === "/agents/configure"}
            onClick={() => navigate("/agents/configure")}
          />
          <NavItem
            label="Providers"
            active={location.pathname === "/agents/providers"}
            onClick={() => navigate("/agents/providers")}
          />
          <NavItem
            label="Presets"
            active={location.pathname === "/agents/presets"}
            onClick={() => navigate("/agents/presets")}
          />
        </NavGroup>
        <NavItem
          icon={<IconSettings />}
          label="Settings"
          active={location.pathname === "/settings"}
          onClick={() => navigate("/settings")}
        />
      </nav>
    </Sidebar>
  );

  return (
    <AppShell sidebar={sidebar}>
      {props.children}
    </AppShell>
  );
};

const App: Component = () => {
  return (
    <ToastProvider>
      <Router>
        <Route path="/popup" component={Popup} />
        <Route path="/" component={AppLayout}>
          <Route path="/" component={Dashboard} />
          <Route path="/analytics" component={Analytics} />
          <Route path="/monitor" component={Monitor} />
          <Route path="/logs" component={Logs} />
          <Route path="/cliproxy" component={CliproxyOverview} />
          <Route path="/cliproxy/providers" component={CliproxyProviders} />
          <Route path="/cliproxy/control-panel" component={CliproxyControlPanel} />
          <Route path="/agents" component={Agents} />
          <Route path="/agents/configure" component={Agents} />
          <Route path="/agents/providers" component={AgentProviders} />
          <Route path="/agents/presets" component={Presets} />
          <Route path="/settings" component={Settings} />
        </Route>
      </Router>
    </ToastProvider>
  );
};

export default App;
