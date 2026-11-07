import React, { useEffect, useState } from "react";
import { tr, locale } from "./i18n/index.js";
import { validatedQuota } from "../../live/api.mjs";
function Gate({ auth, navigate, children }) {
  return auth.user?.role === "organizer" ? (
    children
  ) : (
    <div className="empty-state">
      <h2>{tr("Organizer account required.")}</h2>
      <button className="button" onClick={() => navigate("login")}>
        {tr("Log in")}
      </button>
    </div>
  );
}
export function OrganizerEvents({ runtime, auth, navigate }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{tr("ORGANIZER WORKSPACE")}</p>
          <h1>{tr("Your events")}</h1>
          <p className="muted">
            {tr(
              "Only events owned by your current organizer account are returned by the server.",
            )}
          </p>
        </div>
        <button className="button" onClick={() => navigate("create")}>
          {tr("Create event")}
        </button>
      </div>
      <Gate auth={auth} navigate={navigate}>
        <OwnedEventList runtime={runtime} navigate={navigate} />
      </Gate>
    </>
  );
}
function OwnedEventList({ runtime, navigate }) {
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: "",
  });
  useEffect(() => {
    let current = true;
    setState({
      loading: true,
      data: null,
      error: "",
    });
    runtime
      .withVerifiedAccount(
        (token, actor) =>
          runtime.api.getOrganizerEvents(
            token,
            {
              page,
              pageSize: 6,
            },
            actor,
          ),
        {
          roles: ["organizer"],
        },
      )
      .then((data) => {
        if (current)
          setState({
            loading: false,
            data,
            error: "",
          });
      })
      .catch((error) => {
        if (current)
          setState({
            loading: false,
            data: null,
            error: error.message,
          });
      });
    return () => {
      current = false;
    };
  }, [runtime, page, reload]);
  return (
    <section>
      {state.loading && (
        <div className="loading-state" role="status">
          {tr("Loading your events…")}
        </div>
      )}
      {state.error && (
        <div className="notice notice-error" role="alert">
          {tr(state.error)}
          <button
            className="text-button"
            onClick={() => setReload((value) => value + 1)}
          >
            {tr("Try reading again")}
          </button>
        </div>
      )}
      <div className="registration-list">
        {state.data?.data.map((event) => {
          const quota = validatedQuota(event.quota);
          return (
            <article className="registration-row" key={event.public_id}>
              <div className="record-main">
                <h2>{event.title}</h2>
                <p className="small muted">
                  {event.location} ·{" "}
                  {new Intl.DateTimeFormat(locale(), {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(event.start_time))}
                </p>
                <p className="small muted">
                  {tr("Status")}:{" "}
                  {tr(
                    event.status.charAt(0).toUpperCase() +
                      event.status.slice(1),
                  )}
                </p>
                {quota ? (
                  <p className="small">
                    {tr("Approved")}: {quota.total.approved}/
                    {quota.total.capacity} · {tr("Waiting")}:{" "}
                    {quota.waitingCount}
                  </p>
                ) : (
                  <p className="small muted">
                    {tr("Current availability is unavailable.")}
                  </p>
                )}
              </div>
              <div className="record-actions">
                <button className="button button-small" onClick={()=>navigate("operations",{event:event.public_id})}>{tr("Event operations")}</button>
                <button
                  className="button button-quiet button-small"
                  onClick={() =>
                    navigate("event", {
                      event: event.public_id,
                    })
                  }
                >
                  {tr("View event")}
                </button>
                <button
                  className="button button-small"
                  onClick={() =>
                    navigate("edit", {
                      event: event.public_id,
                    })
                  }
                >
                  {tr("Edit event")}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {state.data && !state.data.data.length && (
        <div className="empty-state">
          <h2>{tr("No events found")}</h2>
        </div>
      )}
      {state.data && (
        <div className="pagination">
          <span>
            {tr("Page")} {page} {tr("of")} {state.data.total_pages}
          </span>
          <div>
            <button
              className="button button-quiet button-small"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              {tr("Previous page")}
            </button>
            <button
              className="button button-quiet button-small"
              disabled={page >= state.data.total_pages}
              onClick={() => setPage((value) => value + 1)}
            >
              {tr("Next page")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
export function OrganizerAnalytics({ runtime, auth, navigate }) {
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{tr("ORGANIZER WORKSPACE")}</p>
          <h1>{tr("Registration overview")}</h1>
          <p className="muted">
            {tr(
              "Recorded registrations for your own events. These are not attendance, outreach or conversion statistics.",
            )}
          </p>
        </div>
      </div>
      <Gate auth={auth} navigate={navigate}>
        <Analytics runtime={runtime} />
      </Gate>
    </>
  );
}
function Analytics({ runtime }) {
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: "",
  });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setState({
      loading: true,
      data: null,
      error: "",
    });
    runtime
      .withVerifiedAccount(
        (token, actor) => runtime.api.getAnalytics(token, actor),
        {
          roles: ["organizer"],
        },
      )
      .then((data) => {
        if (current)
          setState({
            loading: false,
            data,
            error: "",
          });
      })
      .catch((error) => {
        if (current)
          setState({
            loading: false,
            data: null,
            error: error.message,
          });
      });
    return () => {
      current = false;
    };
  }, [runtime, reload]);
  const data = state.data;
  const count = (value) => new Intl.NumberFormat(locale()).format(value);
  return (
    <section className="analytics-workspace">
      <button
        className="button button-quiet button-small"
        onClick={() => setReload((value) => value + 1)}
      >
        {tr("Refresh")}
      </button>
      {state.loading && (
        <div className="loading-state" role="status">
          {tr("Reading recorded statistics…")}
        </div>
      )}
      {state.error && (
        <div className="notice notice-error" role="alert">
          {tr(state.error)}
        </div>
      )}
      {data && (
        <>
          <p className="small muted">
            {tr("As of")}:{" "}
            {new Intl.DateTimeFormat(locale(), {
              dateStyle: "medium",
              timeStyle: "long",
            }).format(new Date(data.as_of_utc))}
          </p>
          <div className="analytics-totals">
            <div>
              <strong>{count(data.totals.events)}</strong>
              <span>{tr("Your events")}</span>
            </div>
            <div>
              <strong>{count(data.totals.registrations)}</strong>
              <span>{tr("Recorded registrations")}</span>
            </div>
          </div>
          <div className="analytics-sections">
            {[
              ["by_status", "By status"],
              ["by_channel", "By channel"],
            ].map(([key, label]) => (
              <section key={key}>
                <h2>{tr(label)}</h2>
                {Object.entries(data[key]).map(([name, value]) => (
                  <div className="analytics-bar" key={name}>
                    <span>
                      {tr(name.charAt(0).toUpperCase() + name.slice(1))}
                    </span>
                    <div>
                      <i
                        style={{
                          width: `${(value / Math.max(1, data.totals.registrations)) * 100}%`,
                        }}
                      />
                    </div>
                    <strong>{count(value)}</strong>
                  </div>
                ))}
              </section>
            ))}
          </div>
          <section className="analytics-events">
            <h2>{tr("By event")}</h2>
            {data.events.map((event) => (
              <div className="analytics-event" key={event.public_id}>
                <span>{event.title}</span>
                <strong>{count(event.registrations)}</strong>
              </div>
            ))}
          </section>
          <div className="notice">
            <strong>
              {tr("Source")}: {data.source}
            </strong>
            <p>{tr(data.definition)}</p>
            <p className="small">
              {tr(
                "Counts are read from the server for the currently verified organizer. No sample data replaces a failed read.",
              )}
            </p>
          </div>
        </>
      )}
    </section>
  );
}
