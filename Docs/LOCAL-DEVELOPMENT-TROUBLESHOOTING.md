# Local Development Troubleshooting

This guide records common local setup and development-server issues, along with safe fixes.

## Vite `EPERM` error while updating dependencies

### Symptoms

While running `npm run dev`, Vite reports an error similar to:

```text
error while updating dependencies:
Error: EPERM: operation not permitted, rename
'...\\node_modules\\.vite\\deps_temp_<id>' -> '...\\node_modules\\.vite\\deps'
```

The app may still be available at `http://localhost:5173/`, but Vite cannot refresh its pre-bundled dependency cache.

### Cause

On Windows, another process can temporarily lock Vite's cache files. This is especially common when the repository is inside a OneDrive-synced folder. OneDrive, Windows Defender, File Explorer, or another Node/Vite process may hold the file while Vite tries to rename it.

### Fix

1. Stop the affected Vite dev server with `Ctrl+C`.
2. In the affected application folder, remove only its Vite cache:

   ```powershell
   Remove-Item -Recurse -Force node_modules\.vite
   ```

3. Start the app again:

   ```powershell
   npm run dev
   ```

For example, for the admin application:

```powershell
cd orderin_admin
Remove-Item -Recurse -Force node_modules\.vite
npm run dev
```

Do not delete the full `node_modules` folder for this error; clearing `node_modules\.vite` is sufficient.

### Prevention

- Avoid running more than one Vite server for the same application folder.
- Let OneDrive finish syncing before starting a dev server, or temporarily pause sync while developing.
- Prefer keeping active development copies outside OneDrive if the issue occurs often.
- Close File Explorer windows open inside the application's `node_modules` directory.

### If it continues

1. Stop all dev servers for the affected app.
2. Verify no stale `node.exe` process is still using that app.
3. Clear `node_modules\.vite` again and restart the server.
4. If the repository is OneDrive-synced, move the working copy to a non-synced local directory and run it there.
