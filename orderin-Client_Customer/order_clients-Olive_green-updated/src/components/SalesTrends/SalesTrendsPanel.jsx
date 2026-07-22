import { useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Leaf, Drumstick } from "lucide-react";
import "./SalesTrendsPanel.css";
import {
  fetchAllOrdersFlat,
  fetchMenuTypeMap,
  buildWeekdayTrends,
  buildDishInsights,
} from "../../services/salesTrendService";

const SalesTrendsPanel = () => {
  const [loading, setLoading] = useState(true);
  const [weekday, setWeekday] = useState([]);
  const [insights, setInsights] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [orders, typeMap] = await Promise.all([fetchAllOrdersFlat(), fetchMenuTypeMap()]);
        const trends = buildWeekdayTrends(orders, typeMap);
        setWeekday(trends);
        setInsights(buildDishInsights(trends));
      } catch (err) {
        console.error("SalesTrendsPanel load error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const maxRevenue = useMemo(() => Math.max(1, ...weekday.map((w) => w.revenue)), [weekday]);
  const avgRevenue = useMemo(
    () => (weekday.length ? weekday.reduce((s, w) => s + w.revenue, 0) / weekday.length : 0),
    [weekday]
  );

  if (loading) return <div className="SalesTrends-panel"><p className="SalesTrends-loading">Crunching order history...</p></div>;
  if (error) return <div className="SalesTrends-panel"><p className="SalesTrends-loading">Couldn't load trends: {error}</p></div>;

  return (
    <div className="SalesTrends-panel">
      <h3>Day-of-Week Sales Trends</h3>
      <p className="SalesTrends-subtitle">
        Revenue by weekday, compared against your weekly average — so you can order raw materials with real demand
        in mind instead of a flat daily quantity.
      </p>

      <div className="SalesTrends-chart">
        {weekday.map((w) => {
          const heightPct = Math.max(4, (w.revenue / maxRevenue) * 100);
          const deltaPct = avgRevenue ? Math.round(((w.revenue - avgRevenue) / avgRevenue) * 100) : 0;
          return (
            <div className="SalesTrends-bar-col" key={w.day}>
              <div className="SalesTrends-bar-track">
                <div className="SalesTrends-bar" style={{ height: `${heightPct}%` }} title={`₹${Math.round(w.revenue)}`} />
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
        {weekday.map((w) => {
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
