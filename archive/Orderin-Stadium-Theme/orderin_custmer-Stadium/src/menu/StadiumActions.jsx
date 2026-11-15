import React, { useState } from "react";
import { Users } from "lucide-react";
import { useGroupOrder } from "../hooks/useGroupOrder";
import closeIcon from "../stadium-icons/icon-close.svg";
import "./StadiumActions.css";

/**
 * Game Day action under the menu hero — group ordering / rounds
 * (a shared table tab everyone adds to, ordered in rounds).
 */
export default function StadiumActions({ tableNumber }) {
  const { session, start, join, nextRound, leave, active } = useGroupOrder(tableNumber);
  const [sheet, setSheet] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  return (
    <>
      <div className="st-actions" role="group" aria-label="Table actions">
        <button
          className={`st-pill ${active ? "on" : ""}`}
          onClick={() => setSheet(true)}
          aria-pressed={active}
        >
          <span className="st-pill-icon">
            <Users size={16} />
          </span>
          <span className="st-pill-label">
            Game<br />Day
          </span>
          {active && <span className="st-pill-badge">R{session.round}</span>}
        </button>
      </div>

      {sheet && (
        <div className="st-sheet-backdrop" onClick={() => setSheet(false)}>
          <div className="st-sheet st-plate" onClick={(e) => e.stopPropagation()}>
            <span className="st-rivet" style={{ bottom: 10, left: 10 }} />
            <span className="st-rivet" style={{ bottom: 10, right: 10 }} />
            <button className="st-sheet-close" onClick={() => setSheet(false)} aria-label="Close">
              <img src={closeIcon} alt="" />
            </button>
            <h3 className="st-sheet-title">Game Day — group order</h3>

            {active ? (
              <div className="st-group-active">
                <p className="st-sheet-copy">
                  Table tab <strong>{session.code}</strong> · Round <strong>{session.round}</strong>
                  <br />
                  {session.members.length} at the table
                </p>
                <button className="st-btn-gold st-sheet-btn" onClick={nextRound}>
                  Start round {session.round + 1}
                </button>
                <button className="st-sheet-btn ghost" onClick={leave}>
                  Close the tab
                </button>
              </div>
            ) : (
              <div className="st-group-start">
                <p className="st-sheet-copy">
                  Everyone at the table adds to one tab and orders in rounds.
                </p>
                <input
                  className="st-input"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <button
                  className="st-btn-gold st-sheet-btn"
                  onClick={() => {
                    start(name);
                    setSheet(false);
                  }}
                >
                  Start a tab for Table {tableNumber || "?"}
                </button>
                <div className="st-sheet-or">or join</div>
                <div className="st-join-row">
                  <input
                    className="st-input"
                    placeholder="Code"
                    maxLength={4}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                  />
                  <button
                    className="st-sheet-btn ghost"
                    onClick={() => {
                      if (code.length >= 3) {
                        join(code, name);
                        setSheet(false);
                      }
                    }}
                  >
                    Join
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
