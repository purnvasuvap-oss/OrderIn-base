# Thermal printing

Kitchen tickets and bills are ESC/POS bytes. The browser cannot open a raw printer port, so a small bridge program on the restaurant computer (or an Android device on the same Wi‑Fi) has to accept them.

## What this repo already does

- Builds one KOT per station (`tandoor`, `chinese`, `bar`, `desserts`, or whatever you set on the dish).
- Builds a bill with GSTIN, FSSAI, SAC `996331`, CGST and SGST.
- POSTs JSON to `http://127.0.0.1:9101/print`:

```json
{
  "station": "tandoor",
  "contentType": "application/escpos",
  "data": "<base64 bytes>"
}
```

- If nothing is listening, the POS uses the normal browser print dialog instead. The staff app shows "Print bridge is not running".

Set `VITE_PRINT_BRIDGE_URL` if the bridge is not on port 9101. Use the PC's LAN address from a tablet, for example `http://192.168.1.20:9101/print`.

## What you still need in the restaurant

A bridge process that:

1. Listens for that POST.
2. Decodes the base64.
3. Writes the bytes to the printer for that station.

On a desktop this is usually a USB or network thermal printer (80mm or 58mm) and a tiny local program. On Android it is a small app using the printer's Bluetooth or USB driver. This repository does not ship that program, and it was not tested on a real printer. The byte layout is the common ESC/POS init, text and cut. Confirm the cut command on your printer model before service.

Map stations in the bridge config, for example `tandoor` → the tandoor printer IP, `bar` → the bar printer. Dishes with no station go to `kitchen`.
