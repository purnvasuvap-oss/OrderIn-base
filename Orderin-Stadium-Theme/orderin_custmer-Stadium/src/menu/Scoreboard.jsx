import React from "react";
import scoreboard from "../stadium-icons/scoreboard.svg";
import "./Scoreboard.css";

/**
 * Decorative stadium scoreboard hung above the menu hero (matches the
 * cinema+stadium mockup). Purely visual — no live match data.
 */
export default function Scoreboard() {
  return (
    <div className="st-scoreboard" aria-hidden="true">
      <img src={scoreboard} alt="" className="st-scoreboard-img" />
    </div>
  );
}
