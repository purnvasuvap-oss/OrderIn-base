export default function EmptyState({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="empty-state">
      {Icon && <Icon size={36} strokeWidth={1.5} />}
      <div style={{ fontWeight: 600, color: "var(--text)" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13 }}>{subtitle}</div>}
      {action}
    </div>
  );
}
