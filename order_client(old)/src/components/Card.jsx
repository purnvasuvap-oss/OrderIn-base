// src/components/Card.js
import React from "react";

export default function Card({ title, onClick }) {
  return (
    <div className="card" onClick={onClick}>
      <h3>{title}</h3>
    </div>
  );
}
