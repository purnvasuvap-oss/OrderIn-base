import { useEffect, useState } from "react";
import { getConnectionInfo } from "../lib/printer";
import { on, EVENTS } from "../lib/bus";

export function usePrinterStatus() {
  const [connection, setConnection] = useState(getConnectionInfo());

  useEffect(() => {
    return on(EVENTS.PRINTER_STATUS_CHANGED, () => setConnection(getConnectionInfo()));
  }, []);

  return connection;
}
