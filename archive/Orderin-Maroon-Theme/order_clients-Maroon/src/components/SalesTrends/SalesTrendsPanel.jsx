import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Leaf, Drumstick } from "lucide-react";
import "./SalesTrendsPanel.css";
import {
  fetchAllOrdersFlat,
  fetchMenuTypeMap,
  buildWeekdayTrends,
  buildMonthlyTrends,
  buildDishInsights,
} from "../../services/salesTrendService";

const SalesTrendsPanel = () => {
  const [loading, setLoading] = useState(true);
  const [weekday, setWeekday] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [insights, setInsights] = useState([]);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("days"); // "days" | "months"
  const [hoveredBucket, setHoveredBucket] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [orders, typeMap] = await Promise.all([fetchAllOrdersFlat(), fetchMenuTypeMap()]);
        const trends = buildWeekdayTrends(orders, typeMap);
        setWeekday(trends);
        setMonthly(buildMonthlyTrends(orders, typeMap));
        setInsights(buildDishInsights(trends));
      } catch (err) {
        console.error("SalesTrendsPanel load error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeBuckets = viewMode === "days" ? weekday : monthly;

  const maxRevenue = useMemo(() => Math.max(1, ...activeBuckets.map((w) => w.revenue)), [activeBuckets]);
  const avgRevenue = useMemo(
    () => (activeBuckets.length ? activeBuckets.reduce((s, w) => s + w.revenue, 0) / activeBuckets.length : 0),
    [activeBuckets]
  );

  if (loading) return <div className="SalesTrends-panel"><p className="SalesTrends-loading">Crunching order history...</p></div>;
  if (error) return <div className="SalesTrends-panel"><p className="SalesTrends-loading">Couldn't load trends: {error}</p></div>;

  return (
    <div className="SalesTrends-panel">
      <h3>{viewMode === "days" ? "Day-of-Week Sales Trends" : "Month-of-Year Sales Trends"}</h3>
      <p className="SalesTrends-subtitle">
        Revenue by {viewMode === "days" ? "weekday" : "month"}, compared against your average — so you can order raw
        materials with real demand in mind instead of a flat quantity.
      </p>

      <button
        className="SalesTrends-toggle"
        onClick={() => { setViewMode((v) => (v === "days" ? "months" : "days")); setHoveredBucket(null); }}
      >
        Days ↔ Months
      </button>

      <div className={`SalesTrends-chart ${viewMode === "months" ? "SalesTrends-monthly" : ""}`}>
        {activeBuckets.map((w) => {
          const heightPct = Math.max(4, (w.revenue / maxRevenue) * 100);
          const deltaPct = avgRevenue ? Math.round(((w.revenue - avgRevenue) / avgRevenue) * 100) : 0;
          return (
            <div className="SalesTrends-bar-col" key={w.day}>
              <div
                className="SalesTrends-bar-track"
                onMouseEnter={() => setHoveredBucket(w.day)}
                onMouseLeave={() => setHoveredBucket(null)}
                onClick={() => setHoveredBucket((prev) => (prev === w.day ? null : w.day))}
              >
                <div className="SalesTrends-bar" style={{ height: `${heightPct}%` }} />
                {hoveredBucket === w.day && (
                  <div className="SalesTrends-overlay">
                    <strong>{w.label}</strong>
                    {w.topItems && w.topItems.length > 0 ? (
                      <ul>
                        {w.topItems.map((ti) => (
                          <li key={ti.name}>{ti.name} — {ti.qty} sold (₹{Math.round(ti.revenue)})</li>
                        ))}
                      </ul>
                    ) : (
                      <span>No sales recorded</span>
                    )}
                  </div>
                )}
              </div>
              <span className={`SalesTrends-delta ${deltaPct >= 0 ? "up" : "down"}`}>
                {deltaPct >= 0 ? "+" : ""}
                {deltaPct}%
              </span>
              <span className="SalesTrends-day-label">{w.label.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>

      <div className="SalesTrends-vegsplit">
        {activeBuckets.map((w) => {
          const total = w.vegQty + w.nonVegQty || 1;
          const vegPct = Math.round((w.vegQty / total) * 100);
          return (
            <div className="SalesTrends-veg-row" key={w.day}>
              <span className="SalesTrends-veg-day">{w.label.slice(0, 3)}</span>
              <div className="SalesTrends-veg-bar">
                <div className="SalesTrends-veg-seg veg" style={{ width: `${vegPct}%` }} />
                <div className="SalesTrends-veg-seg nonveg" style={{ width: `${100 - vegPct}%` }} />
              </div>
              <span className="SalesTrends-veg-pct"><Leaf size={12} /> {vegPct}%</span>
              <span className="SalesTrends-veg-pct nonveg"><Drumstick size={12} /> {100 - vegPct}%</span>
            </div>
          );
        })}
      </div>

      <h4 className="SalesTrends-insights-title">Recommendations</h4>
      <div className="SalesTrends-insights">
        {insights.length === 0 && (
          <p className="SalesTrends-loading">Not enough order history yet to detect strong weekday patterns.</p>
        )}
        {insights.map((ins, idx) => (
          <div key={idx} className="SalesTrends-insight-row">
            {ins.direction === "surge" ? (
              <TrendingUp size={16} color="#15803d" />
            ) : (
              <TrendingDown size={16} color="#dc2626" />
            )}
            <span>
              <strong>{ins.dish}</strong> sales {ins.direction === "surge" ? "surge" : "drop"} by{" "}
              <strong>{Math.abs(ins.deltaPct)}%</strong> on {ins.dayLabel}s (avg {ins.avg}/day vs {ins.qty} that day).{" "}
              {ins.direction === "surge"
                ? `Consider stocking up before ${ins.dayLabel}.`
                : `Consider reducing raw material intake on ${ins.dayLabel} nights.`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SalesTrendsPanel;
