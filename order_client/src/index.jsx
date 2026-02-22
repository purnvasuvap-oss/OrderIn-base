import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

const rootContainer = document.getElementById("root");

// Only create root if it hasn't been created yet
if (!rootContainer._root) {
  rootContainer._root = ReactDOM.createRoot(rootContainer);
}

// Direct render — no ImgBB startup requirement anymore
rootContainer._root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
