import { lazy, Suspense } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppProvider } from "./store/AppStore";
import { useApp } from "./store/appContext";
import { Layout } from "./components/Layout";
import Home from "./pages/Home";

// Admin, mock and practice screens are split out so the first load stays small.
const PracticeSetup = lazy(() => import("./pages/PracticeSetup"));
const PyqPage = lazy(() => import("./pages/PyqPage"));
const MockPage = lazy(() => import("./pages/MockPage"));
const CurrentAffairsPage = lazy(() => import("./pages/CurrentAffairsPage"));
const MapPage = lazy(() => import("./pages/MapPage"));
const RevisePage = lazy(() => import("./pages/RevisePage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const SessionPage = lazy(() => import("./pages/SessionPage"));

function RouteLoader() {
  const { t } = useApp();
  return (
    <div className="page">
      <div className="card">
        <span className="small muted">{t("loading")}</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Suspense fallback={<RouteLoader />}>
          <Routes>
            <Route path="/session" element={<SessionPage />} />
            <Route path="/mock" element={<MockPage />} />
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="/practice" element={<PracticeSetup />} />
              <Route path="/pyq" element={<PyqPage />} />
              <Route path="/current-affairs" element={<CurrentAffairsPage />} />
              <Route path="/map" element={<MapPage />} />
              <Route path="/revise" element={<RevisePage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </HashRouter>
    </AppProvider>
  );
}
