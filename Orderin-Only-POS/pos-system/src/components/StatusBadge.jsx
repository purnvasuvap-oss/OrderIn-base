const MAP = {
  new: "info", confirmed: "info", preparing: "warning", ready: "success",
  completed: "success", cancelled: "danger", refunded: "danger",
  in_stock: "success", low: "warning", critical: "danger", out: "danger",
  active: "success", disabled: "neutral", paid: "success", pending: "warning",
  partial: "warning", high: "danger", normal: "neutral",
  regular: "success", occasional: "info",
};

const TEXT = {
  in_stock: "In Stock", out: "Out of Stock",
  regular: "Regular", occasional: "New / Occasional",
};

export default function StatusBadge({ status }) {
  const tone = MAP[status] || "neutral";
  const label = TEXT[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : "—");
  return <span className={`badge badge-${tone}`}>{label}</span>;
}
