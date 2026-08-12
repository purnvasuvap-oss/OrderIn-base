import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, UtensilsCrossed, FolderPlus } from "lucide-react";
import { useLiveQuery } from "../hooks/useLiveQuery";
import { listCategories, listProducts, saveProduct, deleteProduct, saveCategory, deleteCategory, listInventory } from "../lib/repo";
import { EVENTS } from "../lib/bus";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import Modal from "../components/Modal";
import ConfirmDialog from "../components/ConfirmDialog";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";

const EMPTY_PRODUCT = {
  name: "", description: "", categoryId: "", price: "", costPrice: "", tax: 5,
  sku: "", image: "", prepTime: "", veg: true, available: true, recipe: [],
};

export default function Menu() {
  const { user } = useAuth();
  const toast = useToast();
  const { data: categories } = useLiveQuery(listCategories, [EVENTS.MENU_CHANGED], []);
  const { data: products } = useLiveQuery(listProducts, [EVENTS.MENU_CHANGED], []);
  const { data: inventory } = useLiveQuery(listInventory, [EVENTS.INVENTORY_CHANGED], []);

  const [activeCat, setActiveCat] = useState("all");
  const [editing, setEditing] = useState(null);
  const [catModal, setCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  const filtered = useMemo(() => {
    if (!products) return [];
    return activeCat === "all" ? products : products.filter((p) => p.categoryId === activeCat);
  }, [products, activeCat]);

  const catName = (id) => categories?.find((c) => c.id === id)?.name || "—";

  const openNew = () => setEditing({ ...EMPTY_PRODUCT, categoryId: categories?.[0]?.id || "" });

  const save = async (product) => {
    await saveProduct({
      ...product,
      price: Number(product.price) || 0,
      costPrice: Number(product.costPrice) || 0,
      tax: Number(product.tax) || 0,
      prepTime: Number(product.prepTime) || 0,
    }, user);
    toast.success("Product saved");
    setEditing(null);
  };

  const addCategory = async () => {
    if (!newCatName.trim()) return;
    await saveCategory({ name: newCatName.trim(), sortOrder: (categories?.length || 0) + 1 }, user);
    setNewCatName("");
    toast.success("Category added");
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Menu Management</h2>
          <p className="page-subtitle">Manage categories, products, pricing and recipe mapping.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline" onClick={() => setCatModal(true)}><FolderPlus size={16} /> Categories</button>
          <button className="btn btn-primary" onClick={openNew}><Plus size={16} /> Add product</button>
        </div>
      </div>

      <div className="pos-cats" style={{ marginBottom: 16 }}>
        <button className={`pos-cat-chip ${activeCat === "all" ? "active" : ""}`} onClick={() => setActiveCat("all")}>All</button>
        {(categories || []).map((c) => (
          <button key={c.id} className={`pos-cat-chip ${activeCat === c.id ? "active" : ""}`} onClick={() => setActiveCat(c.id)}>{c.name}</button>
        ))}
      </div>

      <div className="table-wrap">
        {!filtered.length ? (
          <EmptyState icon={UtensilsCrossed} title="No products yet" subtitle="Add your first menu item to get started." />
        ) : (
          <table className="data-table">
            <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Tax</th><th>Prep time</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td data-label="Product"><strong>{p.veg ? "🟢" : "🔴"} {p.name}</strong><br /><span style={{ fontSize: 11, color: "var(--text-muted)" }}>{p.sku}</span></td>
                  <td data-label="Category">{catName(p.categoryId)}</td>
                  <td data-label="Price">₹{p.price?.toFixed(2)}</td>
                  <td data-label="Tax">{p.tax}%</td>
                  <td data-label="Prep time">{p.prepTime} min</td>
                  <td data-label="Status"><StatusBadge status={p.available ? "active" : "disabled"} /></td>
                  <td data-label="">
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(p)}><Pencil size={14} /></button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setDeleteTarget(p)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ProductModal open={!!editing} product={editing} categories={categories || []} inventory={inventory || []}
        onClose={() => setEditing(null)} onSave={save} />

      <Modal open={catModal} onClose={() => setCatModal(false)} title="Categories" width={380}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input className="input" placeholder="New category name" value={newCatName} onChange={(e) => setNewCatName(e.target.value)} />
          <button className="btn btn-primary" onClick={addCategory}>Add</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {(categories || []).map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "var(--surface-alt)", borderRadius: 8 }}>
              <span style={{ fontSize: 13.5 }}>{c.name}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => deleteCategory(c.id, user)}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Delete product" danger
        message={`Remove "${deleteTarget?.name}" from the menu?`} confirmLabel="Delete"
        onConfirm={async () => { await deleteProduct(deleteTarget.id, user); toast.info("Product deleted"); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}

function ProductModal({ open, product, categories, inventory, onClose, onSave }) {
  const [form, setForm] = useState(product);
  useMemo(() => setForm(product), [product]);
  if (!form) return null;

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setRecipeLine = (idx, patch) => setForm((f) => ({ ...f, recipe: f.recipe.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));
  const addRecipeLine = () => setForm((f) => ({ ...f, recipe: [...(f.recipe || []), { inventoryId: inventory[0]?.id || "", qty: 0 }] }));
  const removeRecipeLine = (idx) => setForm((f) => ({ ...f, recipe: f.recipe.filter((_, i) => i !== idx) }));

  return (
    <Modal open={open} onClose={onClose} title={product?.id ? "Edit product" : "Add product"} width={560}
      footer={<>
        <button className="btn btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={() => onSave(form)}>Save product</button>
      </>}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Product name" span={2}><input className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Description" span={2}><textarea className="input" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <Field label="Category">
          <select className="input" value={form.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="SKU"><input className="input" value={form.sku} onChange={(e) => set({ sku: e.target.value })} /></Field>
        <Field label="Selling price (₹)"><input className="input" type="number" value={form.price} onChange={(e) => set({ price: e.target.value })} /></Field>
        <Field label="Cost price (₹)"><input className="input" type="number" value={form.costPrice} onChange={(e) => set({ costPrice: e.target.value })} /></Field>
        <Field label="Tax (%)"><input className="input" type="number" value={form.tax} onChange={(e) => set({ tax: e.target.value })} /></Field>
        <Field label="Prep time (min)"><input className="input" type="number" value={form.prepTime} onChange={(e) => set({ prepTime: e.target.value })} /></Field>
        <Field label="Type">
          <select className="input" value={form.veg ? "veg" : "nonveg"} onChange={(e) => set({ veg: e.target.value === "veg" })}>
            <option value="veg">Vegetarian</option>
            <option value="nonveg">Non-Vegetarian</option>
          </select>
        </Field>
        <Field label="Availability">
          <select className="input" value={form.available ? "1" : "0"} onChange={(e) => set({ available: e.target.value === "1" })}>
            <option value="1">Available</option>
            <option value="0">Disabled</option>
          </select>
        </Field>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong style={{ fontSize: 13.5 }}>Recipe (ingredient mapping)</strong>
          <button className="btn btn-outline btn-sm" onClick={addRecipeLine}>+ Add ingredient</button>
        </div>
        {(!form.recipe || !form.recipe.length) && <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>No ingredients mapped — inventory won't auto-deduct for this item.</div>}
        {(form.recipe || []).map((r, idx) => (
          <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <select className="input" value={r.inventoryId} onChange={(e) => setRecipeLine(idx, { inventoryId: e.target.value })}>
              {inventory.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
            </select>
            <input className="input" style={{ width: 100 }} type="number" value={r.qty} onChange={(e) => setRecipeLine(idx, { qty: Number(e.target.value) || 0 })} />
            <button className="btn btn-ghost btn-sm" onClick={() => removeRecipeLine(idx)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Field({ label, children, span }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}
