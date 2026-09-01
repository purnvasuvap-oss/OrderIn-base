import { Fragment, useMemo, useState } from "react";
import { Search, ScrollText, ChevronDown, ChevronRight } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listAuditLogs } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import EmptyState from "../components/EmptyState";

const ENTITY_FILTERS = ["all", "auth", "order", "product", "category", "inventory", "settings", "employee", "supplier", "expense", "print"];

export default function AuditLog() {
  const { data: logs } = useLiveQuery(listAuditLogs, [EVENTS.AUDIT_CHANGED], []);
  const [entity, setEntity] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  const filtered = useMemo(() => {
    if (!logs) return [];
    return logs
      .filter((l) => (entity === "all" ? true : l.entity === entity))
      .filter((l) => !search || l.action.toLowerCase().includes(search.toLowerCase()) || l.user.toLowerCase().includes(search.toLowerCase()) || String(l.entityId).toLowerCase().includes(search.toLowerCase()));
  }, [logs, entity, search]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Audit Log</h2>
          <p className="page-subtitle">Every login, order change, price edit, discount and inventory adjustment — who did what, and when.</p>
        </div>
      </div>

      <div className="card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <div className="pos-search" style={{ maxWidth: 280 }}>
          <Search size={15} />
          <input placeholder="Search user, action, entity id…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input" style={{ maxWidth: 180 }} value={entity} onChange={(e) => setEntity(e.target.value)}>
          {ENTITY_FILTERS.map((e) => <option key={e} value={e}>{e === "all" ? "All entities" : e}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        {!filtered.length ? (
          <EmptyState icon={ScrollText} title="No audit events" subtitle="Actions across orders, menu, inventory and settings will appear here." />
        ) : (
          <table className="data-table">
            <thead><tr><th></th><th>Time</th><th>User</th><th>Action</th><th>Entity</th><th>Entity ID</th></tr></thead>
            <tbody>
              {filtered.map((l) => (
                <Fragment key={l.id}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setExpanded(expanded === l.id ? null : l.id)}>
                    <td data-label="">{expanded === l.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                    <td data-label="Time" style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{new Date(l.timestamp).toLocaleString()}</td>
                    <td data-label="User">{l.user}</td>
                    <td data-label="Action"><code style={{ fontSize: 12 }}>{l.action}</code></td>
                    <td data-label="Entity" style={{ textTransform: "capitalize" }}>{l.entity}</td>
                    <td data-label="Entity ID" style={{ fontSize: 12, color: "var(--text-muted)" }}>{l.entityId}</td>
                  </tr>
                  {expanded === l.id && (
                    <tr>
                      <td data-label="" colSpan={6} style={{ background: "var(--surface-alt)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: "10px 4px" }}>
                          <DiffPane title="Before" value={l.before} />
                          <DiffPane title="After" value={l.after} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DiffPane({ title, value }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 4 }}>{title}</div>
      <pre style={{
        margin: 0, fontSize: 11.5, background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 8, padding: 10, maxHeight: 220, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
      }}>
        {value ? JSON.stringify(value, null, 2) : "—"}
      </pre>
    </div>
  );
}
