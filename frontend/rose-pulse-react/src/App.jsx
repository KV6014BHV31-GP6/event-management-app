import { tr } from "./i18n/index.js";
import {
  i18n,
  locale,
  changeLanguage,
  localizeInvalid,
  clearInvalid,
} from "./i18n/index.js";
import { useTranslation } from "react-i18next";
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { eventFormValues, safeImagePath } from "./service.js";
import { validatedQuota } from "../../live/api.mjs";
import OfflineWorkspace from "./offline/OfflineWorkspace.jsx";
import { FilePicker, PrivateDocuments } from "./FilePicker.jsx";
import { validateFileReference } from "./phase2-api.js";
const OrganizerEvents = React.lazy(() =>
  import("./OrganizerWorkspace.jsx").then((module) => ({
    default: module.OrganizerEvents,
  })),
);
const OrganizerAnalytics = React.lazy(() =>
  import("./OrganizerWorkspace.jsx").then((module) => ({
    default: module.OrganizerAnalytics,
  })),
);
import EventShare from "./EventShare.jsx";
const Context = createContext(null);
const useApp = () => useContext(Context);
export const hrefFor = (view = "home", params = {}) =>
  `?${new URLSearchParams({
    view,
    ...Object.fromEntries(
      Object.entries(params).filter(
        ([, value]) => value !== "" && value != null,
      ),
    ),
  })}`;
const readLocation = () => {
  const params = new URLSearchParams(window.location.search);
  return {
    view: params.get("view") || "home",
    event: params.get("event") || "",
    keyword: params.get("keyword") || "",
    page: Math.max(1, Number(params.get("page")) || 1),
    pageSize: [3, 6, 12, 24].includes(Number(params.get("pageSize")))
      ? Number(params.get("pageSize"))
      : 6,
  };
};
const date = (value) =>
  new Intl.DateTimeFormat(locale(), {
    dateStyle: "medium",
  }).format(new Date(value));
const time = (value) =>
  new Intl.DateTimeFormat(locale(), {
    timeStyle: "short",
  }).format(new Date(value));
const locked = (state) =>
  ["submitting", "success", "uncertain"].includes(state.status);
const titleCase = (value) =>
  typeof value === "string"
    ? tr(value.charAt(0).toUpperCase() + value.slice(1))
    : "Unknown";
export function Icon({ name, size = 20, ...rest }) {
  const paths = {
    home: "m3 10 9-7 9 7v10H3Zm6 10v-7h6v7",
    calendar: "M5 5h14v16H5ZM8 2v6m8-6v6M5 10h14m-10 4h1m4 0h1m-6 3h1",
    ticket: "M4 4h16v6a2 2 0 0 0 0 4v6H4v-6a2 2 0 0 0 0-4Zm8 0v3m0 3v3m0 3v4",
    plus: "M12 4v16M4 12h16",
    users:
      "M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3m18 0v-3a4 4 0 0 0-3-4M10 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm6 0a4 4 0 0 1 0 8",
    search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm6 14 5 5",
    location:
      "M12 22s8-7 8-13A8 8 0 0 0 4 9c0 6 8 13 8 13Zm0-16a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    arrow: "M4 12h16m-6-6 6 6-6 6",
    back: "M20 12H4m6-6-6 6 6 6",
    globe:
      "M3 12h18M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 0c5 5 5 15 0 20-5-5-5-15 0-20",
    user: "M20 21v-2a7 7 0 0 0-14 0v2M13 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z",
    logout: "M9 4H4v16h5m6-12 5 4-5 4m-7-4h12",
    menu: "M4 6h16M4 12h16M4 18h16",
    help: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 6a3 3 0 1 1 4 3c-1 0-1 1-1 2m0 3h.01",
    clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 3v6l4 2",
    check: "m5 12 4 4L19 6",
    close: "m6 6 12 12M6 18 18 6",
    upload: "M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6",
    edit: "m15 4 5 5M4 20l4-1L21 6l-4-4L4 15Z",
    leaf: "M4 20C2 7 7 2 21 3c0 13-6 19-17 17Zm0 0L17 7",
    heart: "M12 21 3 12C-3 3 8-1 12 6c4-7 15-3 9 6Z",
    mail: "M3 5h18v14H3Zm0 0 9 8 9-8",
    chevron: "m9 5 7 7-7 7",
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={paths[name] || paths.calendar} />
    </svg>
  );
}
export function Brand({ compact = false }) {
  return (
    <span className={`brand ${compact ? "brand-compact" : ""}`}>
      <svg
        className="brand-leaf"
        width="52"
        height="54"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <path
          d="M31 55C10 47 3 31 8 17 19 12 31 22 32 36 32 17 44 8 57 12c5 18-5 34-26 43Z"
          fill="#d5b579"
        />
        <path d="M31 49C10 44 4 28 9 15 23 11 35 27 31 49Z" fill="#288268" />
        <path d="M34 50c-2-17 7-26 23-27-1 14-8 23-23 27Z" fill="#17634f" />
        <path
          d="M31 57c1-15-3-25-13-33m14 23c4-9 11-14 19-17"
          fill="none"
          stroke="#f7f4ed"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
      {!compact && (
        <span>
          <strong>
            ROSE<span className="brand-dot">·</span>PULSE
          </strong>
          <small>{tr("Community Health \xB7 People \xB7 Opportunity")}</small>
        </span>
      )}
    </span>
  );
}
function Link({ view, params, children, className = "", onClick, ...rest }) {
  const { navigate } = useApp();
  return (
    <a
      href={hrefFor(view, params)}
      className={className}
      onClick={(event) => {
        onClick?.(event);
        if (
          !event.defaultPrevented &&
          event.button === 0 &&
          !event.metaKey &&
          !event.ctrlKey &&
          !event.shiftKey &&
          !event.altKey
        ) {
          event.preventDefault();
          navigate(view, params);
        }
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
export function Notice({ children, error = false, ...rest }) {
  return children ? (
    <div
      className={`notice ${error ? "notice-error" : ""}`}
      role={error ? "alert" : "status"}
      {...rest}
    >
      {React.Children.map(children, (child) =>
        typeof child === "string" && child.length > 12 ? tr(child) : child,
      )}
    </div>
  ) : null;
}
function Heading({ eyebrow, title, children, actions }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {children && <p className="muted">{children}</p>}
      </div>
      {actions}
    </div>
  );
}
function Back({ event }) {
  return (
    <Link
      view={event ? "event" : "events"}
      params={
        event
          ? {
              event,
            }
          : {}
      }
      className="back-link"
    >
      <Icon name="back" size={17} />
      {event ? tr("Event details") : tr("All events")}
    </Link>
  );
}
function Status({ value }) {
  const normalized = [
    "pending",
    "approved",
    "waiting",
    "cancelled",
    "rejected",
    "active",
    "completed",
  ].includes(value?.toLowerCase())
    ? value.toLowerCase()
    : "unknown";
  return (
    <span className={`status status-${normalized}`}>
      {normalized === "unknown" ? tr("Unknown") : titleCase(value)}
    </span>
  );
}
function useController(store) {
  return [
    useSyncExternalStore(store.subscribe, store.getSnapshot),
    store.controller,
  ];
}
function Shell({ children }) {
  const { auth, route, runtime, navigate } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(
    () => window.matchMedia?.("(max-width: 700px)").matches ?? false,
  );
  const [languageOpen, setLanguageOpen] = useState(false);
  const [search, setSearch] = useState(route.keyword);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 700px)");
    if (!media) return;
    const changed = () => setMobile(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    setSearch(route.keyword);
    setMenuOpen(false);
  }, [route.view, route.keyword]);
  const nav = [
    {
      view: "home",
      icon: "home",
      label: "Home",
    },
    {
      view: "events",
      icon: "calendar",
      label: "Events",
    },
    {
      view: "registrations",
      icon: "ticket",
      label: "My registrations",
      role: "user",
    },
    {
      view: "create",
      icon: "plus",
      label: "Create event",
      role: "organizer",
    },
    {
      view: "manage",
      icon: "users",
      label: "Manage registrations",
      role: "organizer",
    },
    {
      view: "organizer-events",
      icon: "calendar",
      label: "Your events",
      role: "organizer",
    },
    {
      view: "analytics",
      icon: "users",
      label: "Registration overview",
      role: "organizer",
    },
    {
      view: "leader",
      icon: "users",
      label: "Leader workspace",
      role: "leader",
    },
    {
      view: "offline",
      icon: "ticket",
      label: "Offline drafts",
    },
    {
      view: "profile",
      icon: "user",
      label: "Profile",
    },
  ];
  const items = nav.filter(
    (item) =>
      !item.role ||
      item.role === auth.user?.role ||
      (item.view === "registrations" && !auth.user),
  );
  const submitSearch = (event) => {
    event.preventDefault();
    navigate("events", {
      keyword: search,
      page: 1,
      pageSize: route.pageSize,
    });
  };
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        {tr("Skip to main content")}
      </a>
      <aside
        className={`sidebar ${menuOpen ? "is-open" : ""}`}
        inert={mobile && !menuOpen}
        aria-hidden={mobile && !menuOpen ? true : undefined}
      >
        <Link
          view="home"
          className="sidebar-mark"
          aria-label={tr("ROSE PULSE home")}
        >
          <Brand compact />
        </Link>
        <nav aria-label={tr("Main navigation")}>
          {items.map((item) => (
            <Link
              key={item.view}
              view={item.view}
              className={`nav-item ${route.view === item.view ? "is-active" : ""}`}
              aria-label={tr(item.label)}
              aria-current={route.view === item.view ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{tr(item.label)}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p className="sidebar-note">
            {tr("A place for everyone.")}
            <br />
            {tr("A community for you.")}
          </p>
          <Link
            view="help"
            className="nav-item"
            aria-label={tr("Help & information")}
          >
            <Icon name="help" />
            {tr("Help & information")}
          </Link>
          {auth.user || auth.hasToken ? (
            <button
              className="nav-item"
              aria-label={tr("Log out")}
              onClick={() => {
                runtime.logout();
                navigate("home");
              }}
            >
              <Icon name="logout" />
              {tr("Log out")}
            </button>
          ) : (
            <Link view="login" className="nav-item" aria-label={tr("Log in")}>
              <Icon name="logout" />
              {tr("Log in")}
            </Link>
          )}
        </div>
      </aside>
      {menuOpen && (
        <button
          className="menu-shade"
          aria-label={tr("Close navigation")}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="workspace">
        <header className="masthead">
          <button
            className="icon-button mobile-menu"
            aria-label={tr("Open navigation")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name="menu" />
          </button>
          <Link view="home" aria-label={tr("ROSE PULSE home")}>
            <Brand />
          </Link>
          <div className="masthead-message">
            <strong>
              {tr("Connected communities.")}
              <br />
              {tr("Healthier lives.")}
            </strong>
            <small>{tr("Events \xB7 Wellbeing \xB7 Together")}</small>
          </div>
          <div className="masthead-detail">
            <Icon name="leaf" />
            <span>
              {tr("Growing together")}
              <small>{tr("One community at a time")}</small>
            </span>
          </div>
        </header>
        <div className="toolbar">
          <form className="search" role="search" onSubmit={submitSearch}>
            <Icon name="search" size={18} />
            <label className="sr-only" htmlFor="global-search">
              {tr("Search events")}
            </label>
            <input
              id="global-search"
              type="search"
              placeholder={tr("Search events, keywords\u2026")}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit" aria-label={tr("Search events")}>
              <Icon name="arrow" size={17} />
            </button>
          </form>
          <div className="toolbar-account">
            <div className="language-control">
              <button
                className="language-button"
                aria-expanded={languageOpen}
                onClick={() => setLanguageOpen(!languageOpen)}
              >
                <Icon name="globe" size={18} />
                {i18n.resolvedLanguage === "ms" ? tr("MS") : "EN"}
              </button>
              {languageOpen && (
                <div className="language-popover" role="status">
                  <strong>{tr("Choose language")}</strong>
                  <div className="language-options">
                    <button
                      className="text-button"
                      lang="en"
                      aria-pressed={i18n.resolvedLanguage === "en"}
                      onClick={() => {
                        changeLanguage("en");
                        setLanguageOpen(false);
                      }}
                    >
                      {tr("English")}
                    </button>
                    <button
                      className="text-button"
                      lang="ms"
                      aria-pressed={i18n.resolvedLanguage === "ms"}
                      onClick={() => {
                        changeLanguage("ms");
                        setLanguageOpen(false);
                      }}
                    >
                      {tr("Bahasa Melayu")}
                    </button>
                  </div>
                  <p>
                    {tr(
                      "Malay wording is an engineering draft. NGO language and sensitive-consent review are pending.",
                    )}
                  </p>
                  <button
                    className="text-button"
                    onClick={() => setLanguageOpen(false)}
                  >
                    {tr("Close")}
                  </button>
                </div>
              )}
            </div>
            <span className="toolbar-divider" />
            {auth.user ? (
              <Link view="profile" className="profile-link">
                <span className="avatar">
                  {auth.user.username.slice(0, 1).toUpperCase()}
                </span>
                <span>
                  {tr("Welcome,")}
                  <strong>
                    {titleCase(
                      auth.user.role === "user"
                        ? "participant"
                        : auth.user.role,
                    )}
                  </strong>
                </span>
              </Link>
            ) : (
              <Link view="login" className="button button-small">
                {tr("Log in")}
                <Icon name="arrow" size={15} />
              </Link>
            )}
          </div>
        </div>
        <main
          id="main"
          tabIndex={-1}
          onInvalidCapture={localizeInvalid}
          onInputCapture={clearInvalid}
          onChangeCapture={clearInvalid}
        >
          {auth.checking && (
            <Notice>{tr("Verifying your saved login\u2026")}</Notice>
          )}
          {auth.message && <Notice>{auth.message}</Notice>}
          {children}
        </main>
        <footer className="footer">
          <span>ROSE · PULSE</span>
          <span>{tr("Community Health \xB7 People \xB7 Opportunity")}</span>
          <Link view="help">
            {tr("Help & information")}
            <Icon name="arrow" size={14} />
          </Link>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label={tr("Mobile navigation")}>
        <Link view="home" className={route.view === "home" ? "is-active" : ""}>
          <Icon name="home" />
          <span>{tr("Home")}</span>
        </Link>
        <Link
          view="events"
          className={route.view === "events" ? "is-active" : ""}
        >
          <Icon name="calendar" />
          <span>{tr("Events")}</span>
        </Link>
        <Link
          view={auth.user?.role === "organizer" ? "manage" : "registrations"}
          className={
            ["manage", "registrations"].includes(route.view) ? "is-active" : ""
          }
        >
          <Icon name={auth.user?.role === "organizer" ? "users" : "ticket"} />
          <span>
            {auth.user?.role === "organizer" ? tr("Manage") : tr("My bookings")}
          </span>
        </Link>
        <Link
          view="profile"
          className={route.view === "profile" ? "is-active" : ""}
        >
          <Icon name="user" />
          <span>{tr("Profile")}</span>
        </Link>
      </nav>
    </div>
  );
}
function EventImage({ event, className = "", detail = false, index = 0 }) {
  let gallery = [];
  try {
    gallery = (event.image_files || []).map((file) =>
      validateFileReference(file, "event_image"),
    );
  } catch {
    gallery = [];
  }
  const source = gallery.length
    ? gallery[Math.min(index, gallery.length - 1)].url
    : safeImagePath(event.image_path);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return source && !failed ? (
    <img
      className={className}
      src={source}
      alt={event.title}
      loading={detail ? "eager" : "lazy"}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className={`event-placeholder ${className}`}>
      <Icon name="leaf" size={detail ? 70 : 45} />
      <span>ROSE · PULSE</span>
      <small>{tr("Community events")}</small>
    </div>
  );
}
export function EventCard({ event }) {
  return (
    <article className="event-card">
      <Link
        view="event"
        params={{
          event: event.public_id,
        }}
        className="card-image-link"
        aria-label={tr("View {{title}}", {
          title: event.title,
        })}
      >
        <EventImage event={event} className="card-image" />
        <span className="image-status">
          <Status value={event.status} />
        </span>
      </Link>
      <div className="card-body">
        <h3>
          <Link
            view="event"
            params={{
              event: event.public_id,
            }}
          >
            {event.title}
          </Link>
        </h3>
        <p className="event-meta">
          <Icon name="calendar" size={15} />
          <span>
            {date(event.start_time)}
            <small>
              {time(event.start_time)} – {time(event.end_time)}
            </small>
          </span>
        </p>
        <p className="event-meta">
          <Icon name="location" size={15} />
          <span>{event.location}</span>
        </p>
        <Link
          className="button card-button"
          view="event"
          params={{
            event: event.public_id,
          }}
        >
          {tr("View details")}
          <Icon name="arrow" size={16} />
        </Link>
      </div>
    </article>
  );
}
function Events({ home = false }) {
  const { runtime, route, navigate } = useApp();
  const [state, setState] = useState({
    status: "loading",
    data: null,
    error: "",
  });
  const [reload, setReload] = useState(0);
  const [jump, setJump] = useState(String(route.page));
  const page = home ? 1 : route.page,
    pageSize = home ? 3 : route.pageSize,
    keyword = home ? "" : route.keyword;
  useEffect(() => {
    const request = new AbortController();
    setState({
      status: "loading",
      data: null,
      error: "",
    });
    runtime.api
      .getEvents({
        page,
        pageSize,
        keyword,
        signal: request.signal,
      })
      .then((data) => {
        if (!request.signal.aborted)
          setState({
            status: "ready",
            data,
            error: "",
          });
      })
      .catch((error) => {
        if (!request.signal.aborted && error.kind !== "aborted")
          setState({
            status: "error",
            data: null,
            error: error.message,
          });
      });
    return () => request.abort();
  }, [runtime, page, pageSize, keyword, reload]);
  useEffect(() => setJump(String(page)), [page]);
  const goPage = (next) =>
    navigate("events", {
      page: next,
      pageSize,
      keyword,
    });
  return (
    <div className="browse-page">
      {home && (
        <section className="hero" aria-labelledby="hero-title">
          <img
            src="/images/community-lake.jpg"
            alt={tr("Mountain lake surrounded by a green forest")}
          />
          <div className="hero-content">
            <p className="eyebrow">{tr("GOOD THINGS HAPPEN TOGETHER")}</p>
            <h1 id="hero-title">
              {tr("Healthy communities.")}
              <br />
              {tr("Brighter tomorrows.")}
            </h1>
            <p>{tr("Find your next moment of connection.")}</p>
            <Link view="events" className="button button-gold">
              {tr("Browse events")}
              <Icon name="arrow" size={18} />
            </Link>
          </div>
          <span className="hero-caption">
            <span className="hero-dot" />
            {tr("A little connection goes a long way")}
          </span>
        </section>
      )}
      {!home && (
        <Heading
          eyebrow={tr("FIND YOUR COMMUNITY")}
          title={tr("Explore events")}
        >
          {tr("Find activities, meet people and make time for your wellbeing.")}
        </Heading>
      )}
      <section className="events-section" aria-labelledby="events-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {home ? tr("COME ALONG") : tr("WHAT\u2019S ON")}
            </p>
            <h2 id="events-title">
              {home
                ? tr("Upcoming events")
                : keyword
                  ? `Results for “${keyword}”`
                  : tr("All community events")}
            </h2>
          </div>
          {home ? (
            <Link view="events" className="text-link">
              {tr("View all events")}
              <Icon name="arrow" size={17} />
            </Link>
          ) : (
            <button
              className="button button-quiet button-small"
              onClick={() => setReload(reload + 1)}
            >
              <Icon name="calendar" size={16} />
              {tr("Refresh")}
            </button>
          )}
        </div>
        {!home && (
          <div className="browse-controls">
            <p className="muted">
              {state.data
                ? `${state.data.total_count} events`
                : tr("Events from the community")}
              {keyword && (
                <>
                  {" "}
                  · <Link view="events">{tr("Clear search")}</Link>
                </>
              )}
            </p>
            <label>
              {tr("Events per page")}{" "}
              <select
                value={pageSize}
                onChange={(event) =>
                  navigate("events", {
                    page: 1,
                    pageSize: event.target.value,
                    keyword,
                  })
                }
              >
                {[3, 6, 12, 24].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {state.status === "loading" && (
          <div className="loading-state" role="status">
            <span className="spinner" />
            {tr("Finding community events\u2026")}
          </div>
        )}
        {state.status === "error" && (
          <Notice error>
            {state.error}
            <button
              className="text-button"
              onClick={() => setReload(reload + 1)}
            >
              {tr("Try reading again")}
            </button>
          </Notice>
        )}
        {state.status === "ready" &&
          (state.data.data.length ? (
            <div className="event-grid">
              {state.data.data.map((event) => (
                <EventCard event={event} key={event.public_id} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <Icon name="calendar" size={38} />
              <h3>
                {keyword
                  ? tr("No events found")
                  : tr("More moments are on their way")}
              </h3>
              <p>
                {keyword
                  ? tr("Try another word in the event title or overview.")
                  : tr("There are no events on this page. Check back soon.")}
              </p>
              {page > 1 && (
                <button className="button" onClick={() => goPage(1)}>
                  {tr("Back to first page")}
                </button>
              )}
            </div>
          ))}
        {!home && state.data && state.data.total_pages > 0 && (
          <div className="pagination" aria-label={tr("Event pages")}>
            <span>
              {tr("Page")}
              {state.data.page} {tr("of")} {state.data.total_pages}
            </span>
            <div>
              <button
                className="icon-button"
                aria-label={tr("First page")}
                disabled={page === 1}
                onClick={() => goPage(1)}
              >
                «
              </button>
              <button
                className="icon-button"
                aria-label={tr("Previous page")}
                disabled={page === 1}
                onClick={() => goPage(page - 1)}
              >
                ‹
              </button>
              <button
                className="icon-button"
                aria-label={tr("Next page")}
                disabled={page >= state.data.total_pages}
                onClick={() => goPage(page + 1)}
              >
                ›
              </button>
              <button
                className="icon-button"
                aria-label={tr("Last page")}
                disabled={page >= state.data.total_pages}
                onClick={() => goPage(state.data.total_pages)}
              >
                »
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const next = Number(jump);
                if (
                  Number.isSafeInteger(next) &&
                  next > 0 &&
                  next <= state.data.total_pages
                )
                  goPage(next);
              }}
            >
              <label htmlFor="page-jump">{tr("Go to page")}</label>
              <input
                id="page-jump"
                type="number"
                min="1"
                max={state.data.total_pages}
                required
                value={jump}
                onChange={(event) => setJump(event.target.value)}
              />
              <button className="text-button">{tr("Go")}</button>
            </form>
          </div>
        )}
        <p className="timezone-note">
          <Icon name="clock" size={14} />
          {tr("All times are shown in your browser timezone:")}{" "}
          {Intl.DateTimeFormat().resolvedOptions().timeZone}.
        </p>
      </section>
      {home && (
        <section className="community-note">
          <span className="community-leaf">
            <Icon name="leaf" size={40} />
          </span>
          <div>
            <p className="eyebrow">{tr("BETTER, TOGETHER")}</p>
            <h2>{tr("Your community. Your next chapter.")}</h2>
            <p>
              {tr(
                "Browse freely. Apply with an account or continue as a guest.",
              )}
            </p>
          </div>
          <Link view="events" className="text-link">
            {tr("Find an event")}
            <Icon name="arrow" />
          </Link>
        </section>
      )}
    </div>
  );
}
function useEvent(id) {
  const { runtime } = useApp();
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({
    status: "loading",
    event: null,
    error: "",
  });
  useEffect(() => {
    const request = new AbortController();
    setState({
      status: "loading",
      event: null,
      error: "",
    });
    runtime.api
      .getEvent(id, {
        signal: request.signal,
      })
      .then((event) => {
        if (!request.signal.aborted)
          setState({
            status: "ready",
            event,
            error: "",
          });
      })
      .catch((error) => {
        if (!request.signal.aborted)
          setState({
            status: "error",
            event: null,
            error: error.message,
          });
      });
    return () => request.abort();
  }, [runtime, id, reload]);
  return [state, () => setReload(reload + 1)];
}
function Quota({ event }) {
  const quota = validatedQuota(event.quota);
  return (
    <div className="quota-summary">
      <h3>{tr("Registration availability")}</h3>
      {quota ? (
        <>
          <div>
            <span>{tr("Online places")}</span>
            <strong>
              {quota.online.approved} {tr("approved /")} {quota.online.capacity}{" "}
              {tr("capacity")}
            </strong>
          </div>
          <div>
            <span>{tr("Offline places")}</span>
            <strong>
              {quota.offline.approved} {tr("approved /")}{" "}
              {quota.offline.capacity} {tr("capacity")}
            </strong>
          </div>
          <div>
            <span>{tr("Waiting")}</span>
            <strong>{quota.waitingCount}</strong>
          </div>
        </>
      ) : (
        <p className="muted">{tr("Current availability is unavailable.")}</p>
      )}
      <small>{tr("The server decides each application\u2019s status.")}</small>
    </div>
  );
}
function EventDetail() {
  const { route, auth } = useApp();
  const [imageIndex, setImageIndex] = useState(0);
  const [state, reload] = useEvent(route.event);
  const event = state.event;
  return (
    <>
      <Back />
      {state.status === "loading" && (
        <div className="loading-state" role="status">
          <span className="spinner" />
          {tr("Loading event details\u2026")}
        </div>
      )}
      {state.error && (
        <Notice error>
          {state.error}
          <button className="text-button" onClick={reload}>
            {tr("Try reading again")}
          </button>
        </Notice>
      )}
      {event && (
        <article className="event-detail">
          <div className="detail-photo">
            <EventImage event={event} detail index={imageIndex} />
            <Status value={event.status} />
          </div>
          {event.image_files?.length > 1 && (
            <div
              className="gallery-thumbnails"
              aria-label={tr("Event image gallery")}
            >
              {event.image_files.map((file, index) => (
                <button
                  key={file.id}
                  className={index === imageIndex ? "is-active" : ""}
                  aria-label={tr("Show event image {{number}}", {
                    number: index + 1,
                  })}
                  aria-pressed={index === imageIndex}
                  onClick={() => setImageIndex(index)}
                >
                  <img
                    src={file.url}
                    alt={tr("Event image {{number}}", {
                      number: index + 1,
                    })}
                  />
                </button>
              ))}
            </div>
          )}
          <div className="detail-layout">
            <div>
              <p className="eyebrow">{tr("A MOMENT TO CONNECT")}</p>
              <h1>{event.title}</h1>
              <p className="detail-overview">
                {event.overview ||
                  "The organiser has not added an overview yet."}
              </p>
              <dl className="event-facts">
                <div>
                  <dt>
                    <Icon name="calendar" />
                    {tr("Date & time")}
                  </dt>
                  <dd>
                    {date(event.start_time)} · {time(event.start_time)}
                    <br />
                    <span className="muted">
                      {tr("Ends")}
                      {date(event.end_time)} · {time(event.end_time)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>
                    <Icon name="location" />
                    {tr("Location")}
                  </dt>
                  <dd>{event.location}</dd>
                </div>
              </dl>
              <p className="timezone-note">
                {tr("Times use")}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}.
              </p>
              <EventShare event={event} />
            </div>
            <aside className="detail-action">
              <Quota event={event} />
              {event.status.toLowerCase() === "active" ? (
                <Link
                  view="apply"
                  params={{
                    event: event.public_id,
                  }}
                  className="button"
                >
                  {tr("Apply for this event")}
                  <Icon name="arrow" size={17} />
                </Link>
              ) : (
                <Notice>
                  {tr("This event is not accepting applications.")}
                </Notice>
              )}
              <p className="muted small">
                {tr("An application does not confirm a place.")}
              </p>
              {auth.user?.role === "organizer" &&
                auth.user.id === event.organizer_id && (
                  <Link
                    view="edit"
                    params={{
                      event: event.public_id,
                    }}
                    className="button button-quiet"
                  >
                    <Icon name="edit" size={17} />
                    {tr("Edit event")}
                  </Link>
                )}
            </aside>
          </div>
        </article>
      )}
    </>
  );
}
function AuthForm({ signup = false }) {
  const { runtime, route, navigate, auth } = useApp();
  const [show, setShow] = useState(false);
  const [, setSignupGeneration] = useState(0);
  const [loginState, setLoginState] = useState({
    status: "idle",
    message: "",
  });
  const formRef = useRef(null);
  const busyRef = useRef(false);
  const [signupState, signupController] = useController(
    runtime.store("signup"),
  );
  const state = signup ? signupState : loginState;
  const submit = async (event) => {
    event.preventDefault();
    if (busyRef.current || locked(state)) return;
    const values = Object.fromEntries(new FormData(event.currentTarget));
    busyRef.current = true;
    try {
      if (signup) await signupController.submit(values);
      else {
        setLoginState({
          status: "submitting",
          message: "Verifying your account…",
        });
        await runtime.signIn(values);
        navigate(
          route.event ? "apply" : "home",
          route.event
            ? {
                event: route.event,
              }
            : {},
        );
      }
    } catch (error) {
      setLoginState({
        status: "error",
        message: error.message,
      });
    } finally {
      values.password = "";
      const password = formRef.current?.elements.namedItem("password");
      if (password) password.value = "";
      setShow(false);
      busyRef.current = false;
    }
  };
  return (
    <div className="auth-layout">
      <div className="auth-story">
        <Icon name="leaf" size={46} />
        <p className="eyebrow">{tr("WELCOME TO YOUR COMMUNITY")}</p>
        <h1>
          {tr("A little connection.")}
          <br />
          {tr("A brighter day.")}
        </h1>
        <p>{tr("Come as you are. Find something that brings you together.")}</p>
        <img
          src="/images/community-lake.jpg"
          alt={tr("Peaceful lake and forest")}
        />
      </div>
      <section className="auth-panel">
        <p className="eyebrow">ROSE · PULSE</p>
        <h2>{signup ? tr("Create your account") : tr("Welcome back")}</h2>
        <p className="muted">
          {signup
            ? tr("One account for your community events.")
            : tr("Log in to see your registrations and get involved.")}
        </p>
        {route.event && (
          <Notice>{tr("Your selected event will be kept.")}</Notice>
        )}
        {auth.user && (
          <Notice>
            {tr("You are logged in as")}
            {auth.user.username}.{" "}
            <button className="text-button" onClick={() => runtime.logout()}>
              {tr("Log out locally")}
            </button>
          </Notice>
        )}
        <Notice error={["error", "uncertain"].includes(state.status)}>
          {state.message}
        </Notice>
        {state.status === "success" && signup ? (
          <div className="success-panel">
            <span className="success-check">
              <Icon name="check" size={25} />
            </span>
            <h3>{tr("You\u2019re ready to connect.")}</h3>
            <p>
              {tr("Account {{username}} was created. Log in to continue.", {
                username: state.user.username,
              })}
            </p>
            <Link
              view="login"
              params={{
                event: route.event,
              }}
              className="button"
            >
              {tr("Log in")}
              <Icon name="arrow" size={17} />
            </Link>
            <button
              className="text-button"
              onClick={() => {
                if (runtime.beginAnotherSignup())
                  setSignupGeneration((value) => value + 1);
              }}
            >
              {tr("Create another account")}
            </button>
          </div>
        ) : (
          <form ref={formRef} method="dialog" onSubmit={submit}>
            <fieldset disabled={locked(state)}>
              <legend className="sr-only">
                {signup ? tr("Create account") : tr("Login")}
                {tr("details")}
              </legend>
              <Field
                label={tr("Username")}
                name="username"
                required
                autoComplete="username"
                help={
                  signup
                    ? tr(
                        "3\u201320 characters. Keep your chosen spelling and spacing.",
                      )
                    : undefined
                }
              />
              <div className="field">
                <label htmlFor="password">{tr("Password")}</label>
                <div className="password-input">
                  <input
                    id="password"
                    name="password"
                    type={show ? "text" : "password"}
                    autoComplete={signup ? "new-password" : "current-password"}
                    required
                    minLength={signup ? 6 : undefined}
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-pressed={show}
                  >
                    {show ? tr("Hide") : tr("Show")}
                  </button>
                </div>
                {signup && (
                  <small>
                    {tr("At least 6 characters, up to 72 UTF-8 bytes.")}
                  </small>
                )}
              </div>
              <button className="button full-width" type="submit">
                {state.status === "submitting"
                  ? tr("Please wait\u2026")
                  : signup
                    ? tr("Create account")
                    : tr("Log in")}
                <Icon name="arrow" size={17} />
              </button>
            </fieldset>
          </form>
        )}
        <p className="auth-switch">
          {signup
            ? tr("Already part of the community?")
            : tr("New to ROSE \xB7 PULSE?")}{" "}
          <Link
            view={signup ? "login" : "signup"}
            params={{
              event: route.event,
            }}
          >
            {signup ? tr("Log in") : tr("Create an account")}
          </Link>
        </p>
        <p className="small muted">
          {tr("You can also browse events and apply as a guest.")}
        </p>
      </section>
    </div>
  );
}
export function Field({
  label,
  name,
  help,
  type = "text",
  children,
  wide = false,
  ...rest
}) {
  return (
    <div className={`field ${wide ? "field-wide" : ""}`}>
      <label htmlFor={name}>{label}</label>
      {children ? (
        <select id={name} name={name} {...rest}>
          {children}
        </select>
      ) : type === "textarea" ? (
        <textarea id={name} name={name} rows={3} {...rest} />
      ) : (
        <input id={name} name={name} type={type} {...rest} />
      )}{" "}
      {help && <small>{help}</small>}
    </div>
  );
}
function RoleGate({ role, children }) {
  const { auth } = useApp();
  if (auth.checking) return null;
  if (auth.user?.role === role) return children;
  return (
    <div className="empty-state">
      <Icon name="user" size={40} />
      <h2>
        {auth.user
          ? tr(
              role === "user"
                ? "Participant account required"
                : "Organizer account required",
            )
          : tr("Log in to continue")}
      </h2>
      <p>
        {auth.user
          ? tr("This action is unavailable for your account role.")
          : tr("Verify your account to access this page.")}
      </p>
      {!auth.user && (
        <Link view="login" className="button">
          {tr("Log in")}
          <Icon name="arrow" size={17} />
        </Link>
      )}
    </div>
  );
}
function ImageUpload({ store, disabled, onUploaded, onSelected }) {
  const [state, controller] = useController(store);
  const [file, setFile] = useState(null);
  const input = useRef(null);
  useEffect(() => {
    if (state.status === "success") onUploaded(state.url);
  }, [state.status, state.url, onUploaded]);
  return (
    <div className="image-upload">
      <label htmlFor="event-image-file">
        {tr("Event image")}
        <span className="muted">{tr("(optional)")}</span>
      </label>
      <div className="upload-box">
        <Icon name="upload" size={25} />
        <div>
          <strong>{file?.name || "Add a little colour to your event"}</strong>
          <small>{tr("PNG, JPEG, WebP or GIF \xB7 up to 900 KiB")}</small>
        </div>
      </div>
      <input
        ref={input}
        id="event-image-file"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        disabled={disabled || locked(state)}
        onChange={(event) => {
          const selected = event.target.files?.[0] || null;
          setFile(selected);
          onSelected(Boolean(selected));
        }}
      />
      <div className="form-inline-actions">
        <button
          type="button"
          className="button button-quiet button-small"
          disabled={!file || disabled || locked(state)}
          onClick={() => controller.upload(file)}
        >
          {tr("Upload selected image")}
        </button>
        <button
          type="button"
          className="text-button"
          disabled={!file || disabled || locked(state)}
          onClick={() => {
            if (controller.clearSelection()) {
              setFile(null);
              onSelected(false);
              input.current.value = "";
            }
          }}
        >
          {tr("Clear selection")}
        </button>
      </div>
      <Notice error={["error", "uncertain"].includes(state.status)}>
        {state.message}
      </Notice>
      {state.status === "success" && (
        <img
          className="upload-preview"
          src={state.url}
          alt={tr("Uploaded event preview")}
        />
      )}
      <small className="muted">
        {tr(
          "Upload is a separate action. The uploaded image stays available if saving the event fails.",
        )}
      </small>
    </div>
  );
}
function EventEditor({ edit = false }) {
  const [generation, setGeneration] = useState(0);
  return (
    <>
      <Back />
      <Heading
        eyebrow={tr("BRING PEOPLE TOGETHER")}
        title={edit ? tr("Edit event") : tr("Create event")}
      >
        {tr("A welcoming space starts with the details.")}
      </Heading>
      <RoleGate role="organizer">
        <EventEditorForm
          key={`${edit ? "edit" : "create"}:${generation}`}
          edit={edit}
          onAnother={() => setGeneration((value) => value + 1)}
        />
      </RoleGate>
    </>
  );
}
function EventEditorForm({ edit, onAnother }) {
  const { runtime, route, auth } = useApp();
  const store = runtime.store(edit ? "edit" : "create", {
    event: {
      public_id: edit ? route.event : "",
    },
  });
  const [state, controller] = useController(store);
  const [galleryFiles, setGalleryFiles] = useState(null);
  const [mediaBlocked, setMediaBlocked] = useState(false);
  const [removeImage, setRemoveImage] = useState(false);
  const form = useRef(null);
  useEffect(() => {
    if (
      edit &&
      ["idle", "error"].includes(controller.state.status) &&
      !controller.state.event
    )
      controller.load(route.event);
  }, [controller, edit, route.event]);
  const original = edit ? state.event : null;
  const values = original
    ? eventFormValues(original)
    : {
        title: "",
        overview: "",
        location: "",
        online_quota: "0",
        offline_quota: "0",
        start_time: "",
        end_time: "",
      };
  const disabled =
    locked(state) || (edit && !original) || auth.user?.role !== "organizer";
  const submit = (event) => {
    event.preventDefault();
    if (disabled || mediaBlocked) return;
    const next = Object.fromEntries(new FormData(event.currentTarget));
    next.image_file_ids = (galleryFiles || original?.image_files || []).map(
      (file) => file.id,
    );
    if (edit && removeImage) next.image_path = null;
    controller.submit(next);
  };
  return (
    <div className="editor-layout">
      <section className="form-surface">
        <Notice error={["error", "uncertain"].includes(state.status)}>
          {state.message}
        </Notice>
        {state.status === "loading" && (
          <div className="loading-state">
            <span className="spinner" />
            {tr("Loading current event\u2026")}
          </div>
        )}
        {state.status === "success" ? (
          <div className="success-panel">
            <span className="success-check">
              <Icon name="check" size={25} />
            </span>
            <h2>
              {edit
                ? tr("Your event is updated.")
                : tr("Your event is ready to bring people together.")}
            </h2>
            <p>{state.event.title}</p>
            <p className="small muted">
              {tr("Event reference:")}
              {state.event.public_id}
            </p>
            <Link
              view="event"
              params={{
                event: state.event.public_id,
              }}
              className="button"
            >
              {tr("View event")}
              <Icon name="arrow" size={17} />
            </Link>
            <button
              className="button button-quiet"
              style={{
                marginLeft: 12,
              }}
              onClick={() => {
                if (
                  edit
                    ? runtime.beginAnotherEdit(route.event)
                    : runtime.beginAnotherEvent()
                )
                  onAnother();
              }}
            >
              {edit ? tr("Make another edit") : tr("Create another event")}
            </button>
          </div>
        ) : (
          <form
            ref={form}
            method="dialog"
            onSubmit={submit}
            key={original?.public_id || "new"}
          >
            <fieldset disabled={disabled}>
              <legend className="form-section-title">
                {tr("Event details")}
              </legend>
              <div className="form-grid">
                <Field
                  name="title"
                  label={tr("Event title")}
                  required
                  maxLength={255}
                  defaultValue={values.title}
                  wide
                />
                <Field
                  name="overview"
                  label={tr("Overview (optional)")}
                  type="textarea"
                  defaultValue={values.overview}
                  wide
                />
                <Field
                  name="location"
                  label={tr("Location")}
                  required
                  maxLength={255}
                  defaultValue={values.location}
                  wide
                />
                <Field
                  name="start_time"
                  label={tr("Start date and time")}
                  type="datetime-local"
                  required
                  defaultValue={values.start_time}
                />
                <Field
                  name="end_time"
                  label={tr("End date and time")}
                  type="datetime-local"
                  required
                  defaultValue={values.end_time}
                />
                <Field
                  name="online_quota"
                  label={tr("Online quota")}
                  type="number"
                  required
                  min="0"
                  max="2147483647"
                  step="1"
                  defaultValue={values.online_quota}
                />
                <Field
                  name="offline_quota"
                  label={tr("Offline quota")}
                  type="number"
                  required
                  min="0"
                  max="2147483647"
                  step="1"
                  defaultValue={values.offline_quota}
                />
                {edit && (
                  <Field
                    name="status"
                    label={tr("Event status")}
                    defaultValue={values.status}
                    required
                  >
                    <option value="active">{tr("Active")}</option>
                    <option value="cancelled">{tr("Cancelled")}</option>
                    <option value="completed">{tr("Completed")}</option>
                  </Field>
                )}
              </div>
              <p className="timezone-note">
                <Icon name="clock" size={14} />
                {tr("Dates use")}
                {Intl.DateTimeFormat().resolvedOptions().timeZone}
                {tr(". Quotas are capacities, not remaining places.")}
              </p>
              <FilePicker
                runtime={runtime}
                purpose="event_image"
                initialFiles={original?.image_files || []}
                onChange={setGalleryFiles}
                onBlocked={setMediaBlocked}
                disabled={disabled}
              />
              {edit && original?.image_path && (
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={removeImage}
                    onChange={(event) => setRemoveImage(event.target.checked)}
                  />
                  {tr("Remove the current event image")}
                </label>
              )}
              <div className="form-actions">
                <button
                  className="button"
                  type="submit"
                  disabled={disabled || mediaBlocked}
                >
                  {edit ? tr("Save changes") : tr("Create event")}
                  <Icon name="arrow" size={17} />
                </button>
                <Link
                  view={edit ? "event" : "events"}
                  params={
                    edit
                      ? {
                          event: route.event,
                        }
                      : {}
                  }
                  className="text-link"
                >
                  {tr("Cancel")}
                </Link>
              </div>
            </fieldset>
          </form>
        )}
      </section>
      <aside className="form-context">
        <Icon name="leaf" size={34} />
        <h3>{tr("Make everyone feel welcome.")}</h3>
        <p>
          {tr(
            "A clear title, a helpful overview and a place to meet make it easier to join.",
          )}
        </p>
        <div className="context-divider" />
        <h4>{tr("Before you save")}</h4>
        <p>
          {tr(
            "Check the dates and capacities. Registration status and available places are decided by the server.",
          )}
        </p>
        <p className="small">
          {tr(
            "If a result cannot be confirmed, the form stays locked. Check the event before trying again.",
          )}
        </p>
      </aside>
    </div>
  );
}
function Apply() {
  const { route } = useApp();
  const [state, reload] = useEvent(route.event);
  return (
    <>
      <Back event={route.event} />
      <Heading
        eyebrow={tr("MAKE TIME FOR COMMUNITY")}
        title={tr("Join this event")}
      >
        {state.event
          ? state.event.title
          : tr("Loading your selected event\u2026")}
      </Heading>
      {state.error && (
        <Notice error>
          {state.error}
          <button className="text-button" onClick={reload}>
            {tr("Try reading again")}
          </button>
        </Notice>
      )}
      {state.event && <Application event={state.event} />}
    </>
  );
}
function Application({ event }) {
  const { auth, runtime } = useApp();
  const [guest, setGuest] = useState(false);
  const [supportingFiles, setSupportingFiles] = useState([]);
  const [documentsBlocked, setDocumentsBlocked] = useState(false);
  const guestStore = runtime.store("guest", {
      event,
    }),
    userStore = runtime.store("registration", {
      event,
    });
  const [guestState, guestController] = useController(guestStore);
  const [userState, userController] = useController(userStore);
  const state = guest ? guestState : userState;
  const controller = guest ? guestController : userController;
  const anonymous =
    !auth.user && !auth.hasToken && !auth.checking && !auth.identityBlocked;
  const allowed = (guest && anonymous) || auth.user?.role === "user";
  const active = event.status.toLowerCase() === "active";
  const submit = (submitEvent) => {
    submitEvent.preventDefault();
    if (!allowed || !active || locked(state) || documentsBlocked) return;
    const values = Object.fromEntries(new FormData(submitEvent.currentTarget));
    if (!guest && supportingFiles.length)
      values.file_ids = supportingFiles.map((file) => file.id);
    controller.submit(values);
  };
  return (
    <div className="editor-layout">
      <section className="form-surface">
        {!active && (
          <Notice>{tr("This event is not accepting applications.")}</Notice>
        )}
        {auth.checking ? (
          <Notice>
            {tr("Verifying your login before enabling the application\u2026")}
          </Notice>
        ) : anonymous && !guest ? (
          <div className="application-choice">
            <Icon name="users" size={36} />
            <h2>{tr("How would you like to join?")}</h2>
            <p>
              {tr(
                "Continue as a guest, or use your account to keep track of your registrations.",
              )}
            </p>
            <div className="form-actions">
              <button
                className="button"
                onClick={() => setGuest(true)}
                disabled={!active}
              >
                {tr("Continue as guest")}
                <Icon name="arrow" size={17} />
              </button>
              <Link
                view="login"
                params={{
                  event: event.public_id,
                }}
                className="button button-quiet"
              >
                {tr("Log in")}
              </Link>
              <Link
                view="signup"
                params={{
                  event: event.public_id,
                }}
                className="text-link"
              >
                {tr("Create account")}
              </Link>
            </div>
          </div>
        ) : auth.identityBlocked || (auth.hasToken && !auth.user) ? (
          <Notice error>
            {tr(
              "Your saved login could not be verified. Log in again or explicitly log out before choosing Guest.",
            )}
            <div className="form-actions">
              <Link
                view="login"
                params={{
                  event: event.public_id,
                }}
                className="button"
              >
                {tr("Log in again")}
              </Link>
              <button
                className="button button-quiet"
                onClick={() => runtime.logout()}
              >
                {tr("Log out before choosing Guest")}
              </button>
            </div>
          </Notice>
        ) : auth.user && auth.user.role !== "user" ? (
          <Notice>
            {tr(
              "Use a participant account to apply. An organizer or leader account is not treated as Guest.",
            )}
            <button className="text-button" onClick={() => runtime.logout()}>
              {tr("Log out before choosing Guest")}
            </button>
          </Notice>
        ) : (
          <>
            <Notice>
              {guest
                ? tr("You are applying as a guest, without an account.")
                : tr(
                    "Applying with your verified participant account: {{username}}",
                    {
                      username: auth.user?.username,
                    },
                  )}
            </Notice>
            <Notice error={["error", "uncertain"].includes(state.status)}>
              {state.message}
            </Notice>
            {state.status === "success" ? (
              <div className="success-panel">
                <span className="success-check">
                  <Icon name="check" size={25} />
                </span>
                <p className="eyebrow">{tr("APPLICATION RECEIVED")}</p>
                <h2>{tr("Your application is pending.")}</h2>
                <p>
                  {tr(
                    "A place is not confirmed. Keep this reference and contact the organiser if you need help.",
                  )}
                </p>
                <EventShare event={event} />
                <dl className="receipt">
                  <dt>{tr("Event")}</dt>
                  <dd>{event.title}</dd>
                  <dt>{tr("Application reference")}</dt>
                  <dd>{state.receipt.id}</dd>
                  <dt>{tr("Status")}</dt>
                  <dd>
                    <Status value={state.receipt.status} />
                  </dd>
                </dl>
                {!guest && (
                  <PrivateDocuments
                    runtime={runtime}
                    files={state.receipt.supporting_documents || []}
                  />
                )}
                {guest ? (
                  <Notice>
                    {tr(
                      "Guest applications cannot be retrieved here after you leave or reload. Keep your reference.",
                    )}
                  </Notice>
                ) : (
                  <Link view="registrations" className="button">
                    {tr("My registrations")}
                    <Icon name="arrow" size={17} />
                  </Link>
                )}
              </div>
            ) : (
              <form method="dialog" autoComplete="off" onSubmit={submit}>
                <fieldset disabled={!allowed || !active || locked(state)}>
                  <legend className="form-section-title">
                    {tr("Participant information")}
                  </legend>
                  <div className="form-grid">
                    <Field
                      name="first_name"
                      required
                      label={tr("First name")}
                      maxLength={20}
                    />
                    <Field
                      name="last_name"
                      required
                      label={tr("Last name")}
                      maxLength={20}
                    />
                    <Field
                      name="date_of_birth"
                      label={tr("Date of birth")}
                      type="date"
                      required
                    />
                    <Field
                      name="gender"
                      label={tr("Gender")}
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        {tr("Choose an option")}
                      </option>
                      <option value="male">{tr("Male")}</option>
                      <option value="female">{tr("Female")}</option>
                    </Field>
                    <Field
                      name="phone"
                      required
                      label={tr("Phone")}
                      maxLength={20}
                    />
                    <Field
                      name="national_id"
                      required
                      label={tr("National ID")}
                      maxLength={50}
                      help={tr(
                        "Use the same participant details for each event.",
                      )}
                    />
                  </div>
                  {!guest && (
                    <details className="optional-documents">
                      <summary>
                        {tr("Supporting documents")} {tr("(optional)")}
                      </summary>
                      <FilePicker
                        runtime={runtime}
                        purpose="supporting_document"
                        onChange={setSupportingFiles}
                        onBlocked={setDocumentsBlocked}
                        disabled={!allowed || !active || locked(state)}
                      />
                    </details>
                  )}
                  {guest && (
                    <p className="small muted">
                      {tr(
                        "Guest applications cannot upload private documents. Supporting documents are optional in this version.",
                      )}
                    </p>
                  )}
                  <p className="form-disclaimer">
                    {tr(
                      "Submitting sends an application. A place is not confirmed.",
                    )}
                  </p>
                  <button
                    className="button"
                    type="submit"
                    disabled={documentsBlocked}
                  >
                    {tr("Submit application")}
                    <Icon name="arrow" size={17} />
                  </button>
                </fieldset>
              </form>
            )}
          </>
        )}
      </section>
      <aside className="application-context">
        <EventImage event={event} />
        <div>
          <Status value={event.status} />
          <h3>{event.title}</h3>
          <p className="event-meta">
            <Icon name="calendar" size={16} />
            {date(event.start_time)} · {time(event.start_time)}
          </p>
          <p className="event-meta">
            <Icon name="location" size={16} />
            {event.location}
          </p>
          <Quota event={event} />
        </div>
      </aside>
    </div>
  );
}
function Registrations({ organizer = false }) {
  return (
    <>
      <Heading
        eyebrow={
          organizer ? tr("ORGANIZER WORKSPACE") : tr("YOUR COMMUNITY CALENDAR")
        }
        title={organizer ? tr("Manage registrations") : tr("My registrations")}
      >
        {organizer
          ? tr(
              "Review applications for your events. The server decides approval or waiting status.",
            )
          : tr(
              "Your applications and their current status, read from the server.",
            )}
      </Heading>
      <RoleGate role={organizer ? "organizer" : "user"}>
        <RegistrationList organizer={organizer} />
      </RoleGate>
    </>
  );
}
function RegistrationList({ organizer }) {
  const { runtime, auth } = useApp();
  const [state, controller] = useController(
    runtime.store("records", {
      mode: organizer ? "organizer" : "my",
    }),
  );
  const [confirm, setConfirm] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelMessage, setCancelMessage] = useState("");
  const uncertainCancel = useRef(new Set());
  const cancelFlight = useRef(false);
  const organizerCancel = async (record) => {
    if (cancelFlight.current || uncertainCancel.current.has(record.id)) return;
    cancelFlight.current = true;
    setCancelBusy(true);
    setCancelMessage("");
    try {
      const result = await runtime.withVerifiedAccount(
        (token) => runtime.api.organizerCancelRegistration(record.id, token),
        {
          roles: ["organizer"],
        },
      );
      if (
        result.id !== record.id ||
        result.event_id !== record.event_id ||
        result.participant_id !== record.participant_id ||
        result.created_by_user_id !== record.created_by_user_id ||
        result.status !== "cancelled"
      )
        throw new Error("Unknown cancellation result");
      setCancelMessage(
        "The server cancelled this registration. Current records have been read again.",
      );
      await controller.load();
    } catch (error) {
      const known = [400, 401, 403, 404, 409, 422, 429].includes(error.status);
      if (!known) uncertainCancel.current.add(record.id);
      setCancelMessage(
        known
          ? error.message
          : "The action result is unknown. Do not send it again. Refresh the records and ask the organiser to check.",
      );
    } finally {
      cancelFlight.current = false;
      setCancelBusy(false);
    }
  };
  useEffect(() => {
    controller.accountChanged();
    controller.load();
  }, [controller, auth.user?.id, auth.revision]);
  const busy = controller.busy || cancelBusy;
  return (
    <section className="registrations">
      <div
        className="registration-filters"
        aria-label={tr("Filter registrations")}
      >
        {["", "pending", "approved", "waiting", "rejected", "cancelled"].map(
          (status) => (
            <button
              key={status}
              disabled={busy}
              aria-pressed={state.filter === status}
              className={state.filter === status ? "is-active" : ""}
              onClick={() => {
                setConfirm(null);
                controller.load(status);
              }}
            >
              {status ? titleCase(status) : tr("All")}
            </button>
          ),
        )}
        <button
          className="refresh-records"
          disabled={busy}
          onClick={() => controller.load()}
        >
          <Icon name="calendar" size={16} />
          {tr("Refresh")}
        </button>
      </div>
      <Notice error={state.status === "error"}>{state.message}</Notice>
      <Notice error={state.actionError}>{state.actionMessage}</Notice>
      <Notice>{cancelMessage}</Notice>
      {state.status === "loading" && (
        <div className="loading-state">
          <span className="spinner" />
          {tr("Reading your registrations\u2026")}
        </div>
      )}
      {state.status === "ready" && !state.records.length && (
        <div className="empty-state">
          <Icon name="ticket" size={38} />
          <h2>{tr("No registrations here yet")}</h2>
          <p>
            {state.filter
              ? tr("Try a different status.")
              : tr("Find an event and start your next community moment.")}
          </p>
          {!organizer && (
            <Link view="events" className="button">
              {tr("Browse events")}
              <Icon name="arrow" size={17} />
            </Link>
          )}
        </div>
      )}
      <div className="registration-list">
        {state.records.map((record) => (
          <article className="registration-row" key={record.id}>
            <div className="record-icon">
              <Icon name="ticket" size={26} />
            </div>
            <div className="record-main">
              <span className="eyebrow">
                {tr("EVENT REFERENCE")} {record.event_id}
              </span>
              <h3>
                {organizer
                  ? [record.first_name, record.last_name]
                      .filter(Boolean)
                      .join(" ") || "Participant application"
                  : tr("Community event application")}
              </h3>
              <p className="small muted">
                {tr("Application")}
                <span className="reference">{record.id}</span>
              </p>
              <p className="small muted">
                {date(record.created_at)} · {titleCase(record.channel)}
              </p>
            </div>
            <Status value={record.status} />
            <div className="record-actions">
              {organizer ? (
                <>
                  <button
                    className="button button-quiet button-small"
                    disabled={busy}
                    onClick={() => controller.detail(record.id)}
                  >
                    {tr("View")}
                  </button>
                  {record.status === "pending" && (
                    <button
                      className="button button-small"
                      disabled={controller.locked(record.id)}
                      onClick={() => controller.approve(record.id)}
                    >
                      {tr("Approve")}
                    </button>
                  )}
                  {["pending", "approved", "waiting"].includes(
                    record.status,
                  ) && (
                    <button
                      className="button button-quiet button-small"
                      disabled={
                        busy ||
                        controller.locked(record.id) ||
                        uncertainCancel.current.has(record.id)
                      }
                      onClick={() => setConfirm(record.id)}
                    >
                      {tr("Cancel")}
                    </button>
                  )}
                </>
              ) : (
                ["pending", "approved", "waiting"].includes(record.status) && (
                  <button
                    className="button button-quiet button-small"
                    disabled={controller.locked(record.id)}
                    onClick={() => setConfirm(record.id)}
                  >
                    {tr("Cancel")}
                  </button>
                )
              )}
            </div>
            {confirm === record.id && (
              <div className="cancel-confirm">
                <p>
                  {tr(
                    "Cancel this registration? The server may offer the released place to someone waiting.",
                  )}
                </p>
                <button
                  className="button button-small"
                  disabled={controller.locked(record.id)}
                  onClick={() => {
                    setConfirm(null);
                    if (organizer) organizerCancel(record);
                    else
                      controller.cancel(record.id, {
                        confirmed: true,
                      });
                  }}
                >
                  {tr("Confirm cancellation")}
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirm(null)}
                >
                  {tr("Keep registration")}
                </button>
              </div>
            )}
            {!organizer && (
              <PrivateDocuments
                runtime={runtime}
                files={record.supporting_documents || []}
              />
            )}
          </article>
        ))}
      </div>
      {organizer && (
        <div className="record-detail">
          <Notice error={state.detailStatus === "error"}>
            {state.detailMessage}
          </Notice>
          {state.detail && (
            <section className="form-surface">
              <div className="section-heading">
                <h2>{tr("Application details")}</h2>
                <button
                  className="icon-button"
                  aria-label={tr("Close application details")}
                  onClick={() => controller.load()}
                >
                  <Icon name="close" />
                </button>
              </div>
              <dl className="receipt">
                <dt>{tr("Reference")}</dt>
                <dd>{state.detail.id}</dd>
                <dt>{tr("Event reference")}</dt>
                <dd>{state.detail.event_id}</dd>
                <dt>{tr("Participant")}</dt>
                <dd>
                  {[state.detail.first_name, state.detail.last_name]
                    .filter(Boolean)
                    .join(" ") || "Name unavailable"}
                </dd>
                <dt>{tr("Status")}</dt>
                <dd>
                  <Status value={state.detail.status} />
                </dd>
                <dt>{tr("Channel")}</dt>
                <dd>{titleCase(state.detail.channel)}</dd>
              </dl>
              <PrivateDocuments
                runtime={runtime}
                files={state.detail.supporting_documents || []}
              />
            </section>
          )}
        </div>
      )}
      <p className="small muted registration-footnote">
        {organizer
          ? tr(
              "Only applications returned for your organizer account are shown.",
            )
          : tr("Guest applications are not linked to your account.")}{" "}
        {tr(
          "Event names are unavailable when the API provides only a numeric event reference.",
        )}
      </p>
    </section>
  );
}
function Profile() {
  const { auth, runtime } = useApp();
  return (
    <>
      <Heading eyebrow={tr("YOUR ACCOUNT")} title={tr("Profile")}>
        {tr("Your identity is verified with the server.")}
      </Heading>
      {auth.user ? (
        <section className="profile-panel">
          <span className="avatar avatar-large">
            {auth.user.username.slice(0, 1).toUpperCase()}
          </span>
          <h2>{auth.user.username}</h2>
          <p>
            {auth.user.role === "user"
              ? tr("Participant")
              : titleCase(auth.user.role)}
          </p>
          <p className="muted">
            {auth.persistent
              ? tr(
                  "Your login is kept in this browser tab\u2019s session storage.",
                )
              : tr("Your login is kept only in memory for this page.")}
          </p>
          <button
            className="button button-quiet"
            onClick={() => runtime.logout()}
          >
            <Icon name="logout" size={18} />
            {tr("Log out locally")}
          </button>
          <p className="small muted">
            {tr(
              "Local logout removes this tab\u2019s saved token. It does not revoke issued tokens on the server.",
            )}
          </p>
        </section>
      ) : (
        <div className="empty-state">
          <Icon name="user" size={38} />
          <h2>{tr("Your community starts here")}</h2>
          <p>{tr("Log in to see your account and registrations.")}</p>
          <div className="form-actions">
            <Link view="login" className="button">
              {tr("Log in")}
            </Link>
            <Link view="signup" className="button button-quiet">
              {tr("Create account")}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
function Help({ leader = false }) {
  return (
    <>
      <Heading
        eyebrow="ROSE · PULSE"
        title={leader ? tr("Leader workspace") : tr("Help & information")}
      >
        {leader
          ? tr("Your account is recognised as a community leader.")
          : tr("A little help for your next community moment.")}
      </Heading>
      <div className="help-content">
        {leader ? (
          <>
            <h2>{tr("Leader tools are not available yet.")}</h2>
            <p>
              {tr(
                "Offline registration, referral links, messages and analytics are not connected in this version. Browse public events, or use a participant account to apply.",
              )}
            </p>
            <Link view="events" className="button">
              {tr("Browse events")}
              <Icon name="arrow" size={17} />
            </Link>
          </>
        ) : (
          <>
            <h2>{tr("Joining an event")}</h2>
            <p>
              {tr(
                "Find an event and choose Apply. You can log in with a participant account or explicitly continue as a guest. A pending application does not confirm a place.",
              )}
            </p>
            <h2>{tr("Checking an application")}</h2>
            <p>
              {tr(
                "Signed-in participants can read and cancel eligible applications in My registrations. Guest applications cannot be retrieved here after leaving the receipt page; keep your application reference and contact the organiser.",
              )}
            </p>
            <h2>{tr("If a result is unknown")}</h2>
            <p>
              {tr(
                "Do not submit the same action again. Read the event or registration records and ask the organiser to reconcile the result.",
              )}
            </p>
            <h2>{tr("Available in this version")}</h2>
            <p>
              {tr(
                "Public browsing, account access and online writes require a connection. Synthetic local capture is available only in Offline drafts. Messages and automated notifications are not connected.",
              )}
            </p>
          </>
        )}
      </div>
    </>
  );
}
export default function App({ runtime }) {
  useTranslation(undefined, {
    i18n,
  });
  const [route, setRoute] = useState(readLocation);
  const auth = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const navigate = (view, params = {}) => {
    window.history.pushState({}, "", hrefFor(view, params));
    setRoute(readLocation());
    window.scrollTo?.({
      top: 0,
      behavior: "instant",
    });
  };
  useEffect(() => {
    const changed = () => setRoute(readLocation());
    const restored = (event) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("popstate", changed);
    window.addEventListener("pageshow", restored);
    runtime.restore();
    return () => {
      window.removeEventListener("popstate", changed);
      window.removeEventListener("pageshow", restored);
    };
  }, [runtime]);
  useEffect(() => {
    document.title = `${tr(
      {
        home: "Community events",
        events: "Explore events",
        event: "Event details",
        apply: "Join an event",
        login: "Log in",
        signup: "Create account",
        create: "Create event",
        edit: "Edit event",
        registrations: "My registrations",
        manage: "Manage registrations",
        profile: "Profile",
        help: "Help",
        leader: "Offline drafts",
        offline: "Offline drafts",
        "organizer-events": "Your events",
        analytics: "Registration overview",
      }[route.view] || "Page not found",
    )} | ROSE · PULSE`;
  }, [route.view, i18n.resolvedLanguage]);
  let content;
  switch (route.view) {
    case "home":
      content = <Events home />;
      break;
    case "events":
      content = <Events />;
      break;
    case "event":
      content = <EventDetail />;
      break;
    case "login":
      content = <AuthForm />;
      break;
    case "signup":
      content = <AuthForm signup />;
      break;
    case "create":
      content = <EventEditor />;
      break;
    case "edit":
      content = <EventEditor edit />;
      break;
    case "apply":
      content = <Apply />;
      break;
    case "registrations":
      content = <Registrations />;
      break;
    case "manage":
      content = <Registrations organizer />;
      break;
    case "organizer-events":
      content = (
        <OrganizerEvents runtime={runtime} auth={auth} navigate={navigate} />
      );
      break;
    case "analytics":
      content = (
        <OrganizerAnalytics runtime={runtime} auth={auth} navigate={navigate} />
      );
      break;
    case "profile":
      content = <Profile />;
      break;
    case "help":
      content = <Help />;
      break;
    case "leader":
    case "offline":
      content = (
        <OfflineWorkspace
          runtime={runtime}
          auth={auth}
          initialEvent={route.event}
          navigate={navigate}
        />
      );
      break;
    default:
      content = (
        <div className="empty-state">
          <h1>{tr("Page not found")}</h1>
          <Link view="home" className="button">
            {tr("Back to home")}
          </Link>
        </div>
      );
  }
  return (
    <Context.Provider
      value={{
        runtime,
        auth,
        route,
        navigate,
      }}
    >
      <Shell>
        <div
          className="view-transition"
          key={`${route.view}:${route.event}:${auth.revision}`}
        >
          <React.Suspense
            fallback={
              <div className="loading-state" role="status">
                {"Loading current workspace…"}
              </div>
            }
          >
            {content}
          </React.Suspense>
        </div>
      </Shell>
    </Context.Provider>
  );
}
