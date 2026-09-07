import React from 'react';
import './header.css';

function SearchBar() {
  return (
    <div className="search-container">
        <div className="search-bar">
        <input
            type="text"
            placeholder="Search..."
            className="search-input"
        />
        </div>
    </div>
  );
}

export default SearchBar;
