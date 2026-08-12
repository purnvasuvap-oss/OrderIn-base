import { bandMeta, ROT_BANDS } from "../../utils/rotIndex";
import "./RotBadge.css";

/**
 * item.rotIndex = { score, daysElapsed, shelfLifeDays, daysRemaining } | null
 * item.rotBand = "Green" | "Amber" | "Red" | "Unknown"
 */
const RotBadge = ({ rotIndex, rotBand }) => {
  const meta = bandMeta(rotBand);

  if (rotBand === ROT_BANDS.UNKNOWN || !rotIndex) {
    return <span className="RotBadge RotBadge-unknown" title="Add arrival date & shelf life to track">— No data</span>;
  }

  return (
    <span
      className="RotBadge"
      style={{ color: meta.color, background: meta.bg }}
      title={`${rotIndex.daysElapsed}d of ${rotIndex.shelfLifeDays}d shelf life used`}
    >
      {meta.label} · {rotIndex.score}%
    </span>
  );
};

export default RotBadge;
