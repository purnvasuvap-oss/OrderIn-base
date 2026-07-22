import React from 'react';

function DiagnosticInfo() {
  const mode = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.MODE) ? import.meta.env.MODE : 'unknown';
  return (
    <div>
      <div>Build mode: <strong>{mode}</strong></div>
      <div style={{ marginTop: 6, color: '#666' }}>If you see a configuration error, check your environment variables and rebuild the application.</div>
    </div>
  );
}

export default function FatalConfigError({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fff', color: '#333', padding: 24 }}>
      <div style={{ maxWidth: 680, textAlign: 'left' }}>
        <h1 style={{ color: '#b71c1c', marginBottom: 8 }}>Application configuration error</h1>
        <p style={{ marginBottom: 8 }}>A required server configuration is missing and the application cannot start.</p>
        <pre style={{ background: '#f8f9fa', padding: 12, borderRadius: 6, color: '#333' }}>{message}</pre>
        <div style={{ marginTop: 12, color: '#555' }}>
          <p>Check required environment variables and rebuild the application.</p>
          <ol style={{ marginTop: 6 }}>
            <li>Set the required values in a local <code>.env</code> or as build-time secrets in your CI. Do not commit secrets to source control.</li>
            <li>Do <strong>not</strong> wrap the values in quotes and avoid leading/trailing whitespace.</li>
            <li>Restart the dev server (<code>npm run dev</code>) or rebuild for production (<code>npm run build</code>).</li>
            <li>Open the browser console for diagnostics if needed.</li>
          </ol>

          {/* Developer-friendly diagnostic: report presence & length only (never print the key itself) */}
          <div style={{ marginTop: 12, background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #eee', color: '#444' }}>
            <strong>Diagnostic</strong>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              <DiagnosticInfo />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}