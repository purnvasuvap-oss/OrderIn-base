export default function StatCard({ label, value, icon: Icon, tone = "primary", sub }) {
  return (
    <div className="card" style={{ padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
        background: `var(--${tone === "primary" ? "secondary" : tone + "-bg"})`,
        color: tone === "primary" ? "var(--text)" : `var(--${tone})`,
        flexShrink: 0,
      }}>
        {Icon && <Icon size={20} />}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}
