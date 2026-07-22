# Firebase Auth Emulator — Quick Start

This project includes helpers to start the Firebase Auth emulator locally for phone-auth testing.

Prerequisites
- Node.js and npm installed

Start emulator (no global install required)
1. From project root run:

```powershell
npx firebase emulators:start --only auth
```

2. Or use the helper PowerShell script (captures logs to `emulator-auth.log`):

```powershell
# Windows PowerShell
scripts\start-auth-emulator.ps1
```

3. If you prefer a one-time install of the CLI, install globally (may require Admin):

```powershell
npm install -g firebase-tools
firebase emulators:start --only auth
```

Troubleshooting
- If `npx firebase` fails, run:

```powershell
npm install --save-dev firebase-tools
npx firebase emulators:start --only auth --debug
```

- If you see `ERR_CONNECTION_REFUSED` in the browser, the emulator is not running on `localhost:9099`.
  - Check for processes using the port:
    ```powershell
    netstat -aon | Select-String ":9099"
    ```
  - Probe endpoint from PowerShell:
    ```powershell
    Invoke-WebRequest -Uri http://localhost:9099/ -UseBasicParsing
    ```

- If global `npm install -g firebase-tools` fails, try opening PowerShell as Administrator or use `--unsafe-perm=true`:

```powershell
npm install -g firebase-tools --unsafe-perm=true
```

After emulator is running
- Start your dev server (`npm run dev`) and visit the app at `http://localhost:<vite-port>`.
- The app should connect to the emulator automatically (if running on localhost).

If the emulator fails to start, run the debug command and paste the first ~200 lines of `emulator-auth.log` here and I'll analyze it.