import { useCallback, useEffect, useState } from "react";
import { on } from "../lib/bus";

export function useLiveQuery(loader, events = [], deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const result = await loader();
    setData(result);
    setLoading(false);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loader().then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    const offs = events.map((evt) => on(evt, reload));
    return () => {
      cancelled = true;
      offs.forEach((off) => off());
    };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, reload };
}
