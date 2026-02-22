# Start the Firebase Auth emulator and save logs to emulator-auth.log
# Run this in PowerShell from the project root.
# Requires Node/NPM available. This uses npx so global install is not necessary.

Write-Output "Starting Firebase Auth emulator (debug) -- logs -> emulator-auth.log"
# Run emulator with debug output and tee to file so you can paste logs
npx firebase emulators:start --only auth --debug 2>&1 | Tee-Object -FilePath emulator-auth.log
