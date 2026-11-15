import { useEffect, useState } from "react";
import { countPending, countFailed, getLastSyncAt, listSyncConflicts } from "../lib/sync";
import { on, EVENTS } from "../lib/bus";
import { firebaseEnabled } from "../lib/firebase";

export function useOnlineStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [failed, setFailed] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState(getLastSyncAt());

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    countPending().then(setPending);
    countFailed().then(setFailed);
    listSyncConflicts().then((rows) => setConflicts(rows.length)).catch(() => {});
    const off = on(EVENTS.SYNC_STATUS_CHANGED, (detail) => {
      if (detail?.online !== undefined) setOnline(detail.online);
      if (detail?.pending !== undefined) setPending(detail.pending);
      if (detail?.failed !== undefined) setFailed(detail.failed);
      listSyncConflicts().then((rows) => setConflicts(rows.length)).catch(() => {});
      if (detail?.lastSyncAt) setLastSyncAt(detail.lastSyncAt);
    });
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      off();
    };
  }, []);

  return { online, pending, failed, conflicts, lastSyncAt, firebaseEnabled };
}
