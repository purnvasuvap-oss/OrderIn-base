import React from "react";
import MenuCard from "./MenuCard";

// Generic "title + grid of MenuCards" page. Reused for category pages,
// "Popular Items", and "Today's Special" — those two sections render
// exactly the same layout as a category (just a different item list/title),
// so PublicMenu.jsx passes this component directly for all three instead of
// three near-identical files.
function CategoryPage({ title, items, onSelectItem, onAddItem }) {
  return (
    <div className="pm-page pm-category-page">
      <h2 className="pm-page-title">{title}</h2>
      <div className="pm-category-grid">
        {items.map((item, idx) => (
          <MenuCard key={item.id || `${title}-${idx}`} item={item} onSelect={onSelectItem} onAdd={onAddItem} />
        ))}
      </div>
    </div>
  );
}

export default CategoryPage;
