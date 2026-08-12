import { RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listSyncQueue, listSyncConflicts, retryQueueItem, retryAllFailed, discardQueueItem } from "../lib/sync";
import { EVENTS } from "../lib/bus";
import EmptyState from "./EmptyState";

export default function SyncPanel({ online, firebaseEnabled, lastSyncAt }) {
  const { data: queue } = useLiveQuery(listSyncQueue, [EVENTS.SYNC_STATUS_CHANGED], []);
  const { data: conflicts } = useLiveQuery(listSyncConflicts, [EVENTS.SYNC_STATUS_CHANGED, EVENTS.ORDERS_CHANGED, EVENTS.INVENTORY_CHANGED, EVENTS.MENU_CHANGED], []);

  const pending = (queue || []).filter((q) => q.status === "pending");
  const failed = (queue || []).filter((q) => q.status === "failed");

  return (
    <div>
      <div style={{ fontSize: 13.5, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        <span>Connection: <strong style={{ color: online ? "var(--success)" : "var(--danger)" }}>{online ? "Online" : "Offline"}</strong></span>
        <span>Cloud sync (Firebase): <strong>{firebaseEnabled ? "Enabled" : "Not configured — running fully offline"}</strong></span>
        <span>Last synchronized: {lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Never"}</span>
        <span>Pending: <strong>{pending.length}</strong> · Failed: <strong style={{ color: failed.length ? "var(--danger)" : undefined }}>{failed.length}</strong></span>
      </div>

      {!firebaseEnabled && (
        <div style={{ fontSize: 12.5, color: "var(--text-muted)", background: "var(--surface-alt)", padding: 10, borderRadius: 8, marginBottom: 16 }}>
          Cloud sync isn't configured (no Firebase credentials in <code>.env</code>) — the app runs entirely on local storage.
          Changes will queue here and sync automatically once Firebase is configured and the app is online.
        </div>
      )}

      {failed.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong style={{ fontSize: 13.5, color: "var(--danger)" }}>Failed ({failed.length})</strong>
            <button className="btn btn-outline btn-sm" onClick={retryAllFailed}><RefreshCw size={13} /> Retry all</button>
          </div>
          {failed.map((item) => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "var(--danger-bg)", borderRadius: 8, marginBottom: 6, gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>{item.entity} · {item.action} · {item.payload?.id}</div>
                <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>{item.lastError}</div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => retryQueueItem(item.id)} title="Retry"><RefreshCw size={13} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => discardQueueItem(item.id)} title="Discard"><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <strong style={{ fontSize: 13.5 }}>Pending queue ({pending.length})</strong>
        <div style={{ marginTop: 8 }}>
          {!pending.length ? (
            <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Nothing waiting to sync.</div>
          ) : pending.slice(0, 8).map((item) => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--border)", fontSize: 12.5 }}>
              <span>{item.entity} · {item.action} · {item.payload?.id}</span>
              <span style={{ color: "var(--text-muted)" }}>{new Date(item.createdAt).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <strong style={{ fontSize: 13.5 }}>Conflict log ({(conflicts || []).length})</strong>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
          When a record changed both locally (e.g. offline) and on the server before sync ran, the order status
          furthest along the kitchen workflow wins; other fields use whichever side is newer.
        </p>
        {!conflicts?.length ? (
          <EmptyState icon={AlertTriangle} title="No conflicts recorded" />
        ) : (
          <div style={{ marginTop: 8 }}>
            {conflicts.slice(0, 8).map((c) => (
              <div key={c.id} style={{ padding: "8px 10px", background: "var(--surface-alt)", borderRadius: 8, marginBottom: 6, fontSize: 12.5 }}>
                <strong>{c.entity}</strong> · {c.entityId} · resolved as <code>{c.resolution}</code>
                <div style={{ color: "var(--text-muted)", fontSize: 11.5 }}>{new Date(c.timestamp).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
