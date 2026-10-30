import { useEffect, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  BookOpen,
  Flame,
  Home,
  Languages,
  Moon,
  Newspaper,
  RotateCcw,
  Settings,
  Sun,
} from "lucide-react";
import { useApp } from "../store/appContext";

const NAV = [
  { to: "/", label: "navHome", icon: Home, end: true },
  { to: "/practice", label: "navPractice", icon: BookOpen },
  { to: "/current-affairs", label: "navCurrent", icon: Newspaper },
  { to: "/analytics", label: "navProgress", icon: BarChart3 },
  { to: "/revise", label: "navRevise", icon: RotateCcw },
] as const;

export function Layout() {
  const { t, user, updateSettings } = useApp();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const theme = user.settings.theme;
  const nextTheme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const themeLabel = theme === "system" ? t("system") : theme === "light" ? t("light") : t("dark");

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label={t("appName")}>
            <span className="brand-mark">GK</span>
            <span className="grow">
              <span className="brand-name">{t("appName")}</span>
              <span className="brand-tag">{t("tagline")}</span>
            </span>
          </Link>
          <span className="streak-pill" title={t("dailyStreak")}>
            <Flame size={14} /> {user.streak.count}
          </span>
          <button
            className="icon-btn lang-btn"
            onClick={() => updateSettings({ lang: user.settings.lang === "en" ? "hi" : "en" })}
            aria-label={t("language")}
            title={t("language")}
          >
            <Languages size={16} />
            {user.settings.lang === "en" ? "EN" : "हि"}
          </button>
          <button
            className="icon-btn"
            onClick={() => updateSettings({ theme: nextTheme })}
            aria-label={`${t("theme")}: ${themeLabel}`}
            title={`${t("theme")}: ${themeLabel}`}
          >
            {theme === "dark" ? <Moon size={19} /> : <Sun size={19} />}
          </button>
          <Link className="icon-btn" to="/settings" aria-label={t("settings")}>
            <Settings size={19} />
          </Link>
        </div>
      </header>

      <main className="app-shell">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label={t("mainMenu")}>
        <div className="bottom-nav-inner">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : undefined}
                className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
              >
                <Icon size={21} strokeWidth={2.1} />
                {t(item.label)}
                {item.to === "/revise" && user.revisions.filter((r) => r.dueAt <= Date.now()).length > 0 && (
                  <span className="nav-badge">
                    {user.revisions.filter((r) => r.dueAt <= Date.now()).length}
                  </span>
                )}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </>
  );
}

export function PageHead({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
