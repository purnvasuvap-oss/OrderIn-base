import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import routes from "../routes";
import { db, getAuthInfo, trySignInAnonymously } from "../firebase";
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, deleteField } from "firebase/firestore";
import storageService from "../services/storageService";

const RESTAURANT_NUMBER = import.meta.env.VITE_RESTAURANT_NUMBER || '0';

import "./MenuPage.css";
// Placeholder images for the item images (use actual image paths or URLs)
const imageBase64 = {
  biryani: "/images/placeholder.jpg", // Replace with actual image path
  chickenBurger: "/images/placeholder.jpg",
  vegFriedRice: "/images/placeholder.jpg",
  chickenManchuria: "/images/placeholder.jpg",
  gobiManchuria: "/images/placeholder.jpg",
  redVelvetCake: "/images/placeholder.jpg",
  splDumBiryani: "/images/placeholder.jpg",
  gobiRice: "/images/placeholder.jpg",
  chocolateDessert: "/images/placeholder.jpg",
};

const MenuPage = () => {
  const navigate = useNavigate();
  const [menuItems, setMenuItems] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null); // single-row edit index (null = none)
  const [editedItems, setEditedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // { type: 'success'|'error', message: string }
  const isEditingMenu = isAdding || editingIndex !== null || isSaving;
  const editModeLabel = isAdding ? "Adding new menu item" : editingIndex !== null ? "Editing menu item" : "";
  const activeEditItem = editedItems[0] || {};
  const activeEditorImage = activeEditItem.image || activeEditItem.image_url || activeEditItem.oldImage || "";

  const handleBackToDashboard = () => {
    sessionStorage.removeItem("menuAuth");
    navigate(routes.dashboard, { replace: true });
  };




  // Fetch menu items from Firestore on component mount
  useEffect(() => {
    const fetchMenuItems = async () => {
      try {
        const menuCollection = collection(db, "Restaurant", "orderin_restaurant_1", "menu");
        const menuSnapshot = await getDocs(menuCollection);
        const items = menuSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setMenuItems(items);
      } catch (error) {
        console.error("Error fetching menu items:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMenuItems();
  }, []);

  // Batch editing has been removed. Use per-row Edit buttons instead.

  // Edit a single row in-place without making all rows editable
  const handleEditRow = (rowIndex) => {
    setIsAdding(false);
    setEditingIndex(rowIndex);
    const item = menuItems[rowIndex] || {};
    const single = {
      ...item,
      oldImage: item.image_url || item.image || null,
      // store previous firebase storage path (if any) so we can delete on replace
      oldImagePath: item.image_path || null
    };
    setEditedItems([single]);
  }; 

  const handleAdd = () => {
    const newItem = {
      category: "",
      name: "",
      image: "",
      price: "",
      promotions: false,
      availability: "Yes",
      description: "",
      type: "",
    };
    setIsAdding(true);
    setEditingIndex(null);
    setEditedItems([newItem]);
  }; 

  // Video uploads are no longer supported in the project. Removed uploadWithRetry and all video handling.

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      console.log("Starting save process...");
      // Prepare a local copy of edited items so we can adjust behavior (image uploads only)
      let itemsToProcess = editedItems.map(i => ({ ...i }));

      // Validate edited items. Only require an image for NEW items (no id).
      // For existing items, allow partial updates (updating fields without providing an image).
      for (const [idx, item] of itemsToProcess.entries()) {
        const isNew = !item.id;
        const hasNewFile = Boolean(item.imageFile);
        const hasDataUrl = item.image && typeof item.image === 'string' && item.image.startsWith('data:');
        let hasExistingImage = Boolean(item.image_url) || (item.image && typeof item.image === 'string' && item.image.startsWith('http')) || hasDataUrl;

        // If this is a single-row edit, fallback to the original menuItems entry for the image if needed
        if (!hasExistingImage && editingIndex !== null) {
          const original = menuItems[editingIndex];
          if (original && (original.image_url || (original.image && typeof original.image === 'string' && (original.image.startsWith('http') || original.image.startsWith('data:'))))) {
            hasExistingImage = true;
          }
        }

        // Secondary fallback: find original by id
        if (!hasExistingImage && item.id) {
          const originalById = menuItems.find(m => m.id === item.id);
          if (originalById && (originalById.image_url || (originalById.image && typeof originalById.image === 'string' && (originalById.image.startsWith('http') || originalById.image.startsWith('data:'))))) {
            hasExistingImage = true;
          }
        }

        // Enforce image only for new items
        if (isNew && !hasExistingImage && !hasNewFile) {
          setSaveStatus({ type: 'error', message: 'Image is required for new items.' });
          setIsSaving(false);
          setTimeout(() => setSaveStatus(null), 6000);
          return;
        }

        // For existing items: do not require image; proceed with partial updates
      }

      const menuCollection = collection(db, "Restaurant", "orderin_restaurant_1", "menu");
      console.log("Menu collection:", menuCollection);
      
      for (const item of itemsToProcess) {
        console.log("Processing item:", item);
        const { id, imageFile, image, ...data } = item;
        let imageUrl = item.image_url || image || null; // prefer canonical field for display


        // Do NOT delete the old storage image before uploading the new one.
        // We'll delete the previous image only after a successful upload below to avoid data loss on upload failure.
        if (imageFile && (item.oldImageDeleteHash || item.oldImageId)) {
          // Legacy external image metadata found — automatic deletion is skipped for safety
          console.warn("Legacy external image metadata present on item; automatic deletion is skipped.");
        }



        // Prepare canonical image metadata placeholders
        let image_id = data.image_id || data.imageId || null;
        let image_delete_hash = data.image_delete_hash || data.imageDeleteUrl || null;
        let image_name = data.image_name || data.imageName || null;
        let image_url = data.image_url || data.image || null;

        // Accept File object or data URL (base64) for uploading
        const uploadInput = imageFile || (typeof item.image === 'string' && item.image.startsWith('data:') ? item.image : null);
        if (uploadInput) {
          try {
            console.log("Uploading image to Firebase Storage (menu/images):", uploadInput && uploadInput.name ? `${uploadInput.name} (${(uploadInput.size/1024).toFixed(2)}KB)` : (typeof uploadInput === 'string' ? '(data-url or url)' : uploadInput));
            const result = await storageService.uploadFile(uploadInput, 'menu/images', RESTAURANT_NUMBER);
            image_url = result.image_url || null;
            const image_path = result.image_path || null;
            image_name = result.image_name || null;
            console.log("Firebase upload success:", image_url, image_path, image_name);

            // Delete old firebase image if present and replaced
            if (item.oldImagePath) {
              try {
                await storageService.deleteFileByPath(item.oldImagePath);
                console.log('Deleted old firebase image at path:', item.oldImagePath);
              } catch (delErr) {
                console.warn('Failed to delete previous firebase image (not fatal):', delErr);
              }
            }

            // Set canonical fields; image_path stored as a dedicated field
            image_delete_hash = null;
            image_id = null;
            image_name = image_name || null;
            // Attach the storage path into a dedicated field
            // We'll write image_path into Firestore below as part of itemData
            item._image_path_for_save = image_path;

            // If the upload didn't produce a URL, treat as error
            if (!image_url) {
              console.error('Firebase upload completed but returned no image URL:', result);
              setSaveStatus({ type: 'error', message: 'Image upload did not return a URL. Please try a different file.' });
              setIsSaving(false);
              return;
            }
          } catch (uploadError) {
            console.error("Error uploading image to Firebase Storage:", uploadError);

            // If unauthorized, attempt a one-time anonymous sign-in (dev-friendly) and retry once
            const isAuthError = (uploadError && (uploadError.code === 'storage/unauthorized' || (uploadError.message || '').toLowerCase().includes('permission')));
            if (isAuthError) {
              console.warn('Upload failed due to authorization; attempting anonymous sign-in and retry...');
              try {
                const res = await trySignInAnonymously();
                if (res && res.success) {
                  console.log('Anonymous sign-in succeeded; retrying upload once...');
                  try {
                    const retryResult = await storageService.uploadFile(uploadInput, 'menu/images', RESTAURANT_NUMBER);
                    image_url = retryResult.image_url || null;
                    const image_path = retryResult.image_path || null;
                    image_name = retryResult.image_name || null;
                    console.log('Retry upload success:', image_url, image_path, image_name);
                    item._image_path_for_save = image_path;
                  } catch (retryErr) {
                    console.error('Retry upload failed:', retryErr);
                    const msg = retryErr && retryErr.message ? retryErr.message : 'Image upload failed. Please try again.';
                    setSaveStatus({ type: 'error', message: 'Image upload failed: ' + msg });
                    setIsSaving(false);
                    return;
                  }
                } else {
                  console.warn('Anonymous sign-in attempt failed:', res && res.error);
                }
              } catch (signErr) {
                console.warn('Anonymous sign-in attempt threw an error:', signErr);
              }
            }

            const msg = uploadError && uploadError.message ? uploadError.message : 'Image upload failed. Please try again.';
            setSaveStatus({ type: 'error', message: 'Image upload failed: ' + msg });
            setIsSaving(false);
            return; // abort save on upload failure to avoid saving without an image
          }
        }

        // Videos are not supported. Construct item data with canonical image fields only.
        const itemData = { ...data, image_id, image_url, image_delete_hash, image_name, image_path: (item._image_path_for_save || data.image_path || null) };
        // Remove legacy external-only fields if present (cleanup on write)
        delete itemData.imageDeleteUrl; delete itemData.imageId;
        console.log("Item data to save:", itemData);

        // Estimate final document size in bytes and abort early if it would exceed Firestore's limit
        const MAX_FIRESTORE_DOC_BYTES = 1048576; // 1 MiB
        const RESERVED_BYTES = 50000; // safe reserve for other fields/metadata
        const MAX_DOC_BYTES = MAX_FIRESTORE_DOC_BYTES - RESERVED_BYTES;
        const estimateBytes = (obj) => {
          try {
            const str = JSON.stringify(obj);
            return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(str).length : str.length;
          } catch (e) {
            return 0;
          }
        };

        const docSize = estimateBytes(itemData);
        if (docSize > MAX_DOC_BYTES) {
          const sizeMB = (docSize / (1024 * 1024)).toFixed(2);
          const maxMB = (MAX_DOC_BYTES / (1024 * 1024)).toFixed(2);
          console.error(`Estimated document size ${sizeMB} MB exceeds allowed ${maxMB} MB`);
          setSaveStatus({ type: 'error', message: `Document too large to save (${sizeMB} MB). Use smaller images.` });
          setIsSaving(false);
          return;
        }

        // Perform the Firestore write with explicit error handling for document-size issues
        try {
          if (id) {
            console.log("Updating existing item with ID:", id);
            await updateDoc(doc(menuCollection, id), itemData);

            // Remove legacy image/video fields to enforce canonical schema
            try {
              await updateDoc(doc(menuCollection, id), {
                image: deleteField(),
                imageId: deleteField(),
                imageDeleteUrl: deleteField(),
                imageName: deleteField(),
                videos: deleteField(),
                oldVideos: deleteField()
              });
            } catch (cleanupErr) {
              console.warn('Failed to remove legacy fields from document:', cleanupErr);
            }
          } else {
            console.log("Adding new item");
            await addDoc(menuCollection, itemData);
          }
        } catch (fireErr) {
          console.error("Firestore write error:", fireErr);
          const serverMsg = fireErr && fireErr.message ? fireErr.message : String(fireErr);
          const isSizeError = serverMsg.includes('exceeds the maximum allowed size') || serverMsg.includes('TOO_LARGE');
          const friendlyMsg = isSizeError ? 'Document too large to write to Firestore. Use smaller images.' : 'Error writing to Firestore: ' + serverMsg;
          setSaveStatus({ type: 'error', message: friendlyMsg });
          setIsSaving(false);
          throw new Error(friendlyMsg);
        }
      }
      // Refetch to get updated data with IDs
      console.log("Refetching items...");
      const menuSnapshot = await getDocs(menuCollection);
      const updatedItems = menuSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      console.log("Updated items:", updatedItems);
      setMenuItems(updatedItems);
      setIsAdding(false);
      setEditingIndex(null);
      setSaveStatus({ type: 'success', message: 'Menu items saved successfully.' });
      // clear success message after a short delay
      setTimeout(() => setSaveStatus(null), 4000);
      setIsSaving(false);
    } catch (error) {
      console.error("Error saving menu items:", error);
      setSaveStatus({ type: 'error', message: 'Error saving menu items: ' + error.message });
      setIsSaving(false);
      setTimeout(() => setSaveStatus(null), 6000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingIndex(null);
    setEditedItems([]);
  };  

  const handleDraftChange = (field, value) => {
    setEditedItems((current) => [{ ...(current[0] || {}), [field]: value }]);
  };

  const handleDraftFileChange = (field, file) => {
    setEditedItems((current) => [{ ...(current[0] || {}), [`${field}File`]: file }]);
  };

  const handleInputChange = (rowIndex, field, value) => {
    if (editingIndex !== null) {
      if (rowIndex !== editingIndex) return;
      handleDraftChange(field, value);
    }
  };

  const handleFileChange = (rowIndex, field, file) => {
    if (editingIndex !== null) {
      if (rowIndex !== editingIndex) return;
      handleDraftFileChange(field, file);
    }
  };  

  const handleDelete = async (index) => {
    if (isEditingMenu) return;

    try {
      const itemToDelete = menuItems[index];
      if (itemToDelete.id) {
        // Delete associated image if it's stored on Firebase Storage
        if (itemToDelete.image_path) {
          try {
            await storageService.deleteFileByPath(itemToDelete.image_path);
            console.log("Deleted firebase image via stored path:", itemToDelete.image_path);
          } catch (err) {
            console.error("Error deleting firebase image via stored path:", err);
          }
        } else if (itemToDelete.image && itemToDelete.image.startsWith('https://firebasestorage.googleapis.com')) {
          console.warn('Found a legacy Firebase-hosted image URL; automatic deletion is disabled unless storage path is known.');
        }

        const menuCollection = collection(db, "Restaurant", "orderin_restaurant_1", "menu");
        await deleteDoc(doc(menuCollection, itemToDelete.id));
      }
      const updatedItems = [...menuItems];
      updatedItems.splice(index, 1);
      setMenuItems(updatedItems);
      // Adjust single-row edit index if necessary
      if (editingIndex !== null) {
        if (index === editingIndex) {
          // Deleted the row being edited — clear edit state
          setEditingIndex(null);
          setEditedItems([]);
          setIsAdding(false);
        } else if (index < editingIndex) {
          // Row removed above the editing index — shift the index down
          setEditingIndex(editingIndex - 1);
        }
      }
    } catch (error) {
      console.error("Error deleting menu item:", error);
    }
  };

  return (
    <div className="menu-management-container">
       {/* --- TOP HEADER ROW: Back Button and Title --- */}

      <div className="menu-header-bar header-top-row">

        <button className="btn-back" onClick={handleBackToDashboard}>Back</button>

        <h1 className="h1-page-title">Menu Management</h1>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="header-actions">
            {isEditingMenu ? (
              <>
                <button className="btn-primary menu-save-btn" onClick={handleSave} disabled={isSaving}>{isSaving ? 'SAVING...' : 'SAVE'}</button>
                <button className="btn-primary menu-cancel-btn" onClick={handleCancel} disabled={isSaving}>CANCEL</button>
              </>
            ) : (
              <>
                <button className="btn-primary" onClick={handleAdd}>ADD</button>
                <button className="btn-primary" onClick={() => navigate(routes.promotions)}>Create Promotions</button>
              </>
            )} 
          </div>

        </div>

      </div>

      {saveStatus && (
        <div style={{ margin: '8px 0', color: saveStatus.type === 'success' ? '#155724' : '#721c24', background: saveStatus.type === 'success' ? '#d4edda' : '#f8d7da', padding: '8px 12px', borderRadius: 4 }}>
          {saveStatus.message}
        </div>
      )} 

      {isEditingMenu && (
        <section className="menu-editor-panel" aria-label={editModeLabel}>
          <div className="menu-editor-header">
            <div>
              <span className="menu-editor-kicker">{isAdding ? "New item" : "Selected item"}</span>
              <h2>{isAdding ? "Add Menu Item" : activeEditItem.name ? `Edit ${activeEditItem.name}` : "Edit Menu Item"}</h2>
            </div>
            <span className="menu-editor-state">{isSaving ? "Saving" : isAdding ? "Draft" : `Row ${editingIndex + 1}`}</span>
          </div>

          <div className="menu-editor-grid">
            <label className="menu-editor-field">
              <span>Category</span>
              <input
                className="menu-editor-control"
                type="text"
                value={activeEditItem.category || ""}
                onChange={(e) => handleDraftChange("category", e.target.value)}
                placeholder="Starters"
              />
            </label>

            <label className="menu-editor-field">
              <span>Item Name</span>
              <input
                className="menu-editor-control"
                type="text"
                value={activeEditItem.name || ""}
                onChange={(e) => handleDraftChange("name", e.target.value)}
                placeholder="Paneer Tikka"
              />
            </label>

            <label className="menu-editor-field">
              <span>Price</span>
              <input
                className="menu-editor-control"
                type="text"
                inputMode="decimal"
                value={activeEditItem.price || ""}
                onChange={(e) => handleDraftChange("price", e.target.value)}
                placeholder="199"
              />
            </label>

            <label className="menu-editor-field">
              <span>Type</span>
              <input
                className="menu-editor-control"
                type="text"
                value={activeEditItem.type || ""}
                onChange={(e) => handleDraftChange("type", e.target.value)}
                placeholder="Veg / Non-Veg"
              />
            </label>

            <label className="menu-editor-field">
              <span>Availability</span>
              <select
                className="menu-editor-control"
                value={activeEditItem.availability || ""}
                onChange={(e) => handleDraftChange("availability", e.target.value)}
              >
                <option value="">Select</option>
                <option value="Yes">Yes</option>
                <option value="No">No</option>
              </select>
            </label>

            <div className="menu-editor-field menu-editor-toggle-field">
              <span>Promotions</span>
              <div className="menu-editor-toggle-row">
                <strong>{activeEditItem.promotions ? "Enabled" : "Disabled"}</strong>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={Boolean(activeEditItem.promotions)}
                    onChange={(e) => handleDraftChange("promotions", e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>
            </div>

            <div className="menu-editor-field menu-editor-image-field">
              <span>Item Image</span>
              <div className="menu-editor-image-card">
                {activeEditorImage ? (
                  <img src={activeEditorImage} alt="" className="menu-editor-image-preview" />
                ) : (
                  <div className="menu-editor-image-empty">Image</div>
                )}
                <div className="menu-editor-image-meta">
                  <label className="menu-editor-upload">
                    Choose Image
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) {
                          handleDraftFileChange("image", file);
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            handleDraftChange("image", event.target.result);
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </label>
                  {activeEditItem.imageFile && (
                    <small>{activeEditItem.imageFile.name}</small>
                  )}
                </div>
              </div>
            </div>

            <label className="menu-editor-field menu-editor-description-field">
              <span>Description</span>
              <textarea
                className="menu-editor-control menu-editor-textarea"
                value={activeEditItem.description || ""}
                onChange={(e) => handleDraftChange("description", e.target.value)}
                rows="4"
                placeholder="Short item description"
              />
            </label>
          </div>

          <div className="menu-editor-footer">
            <span>{isAdding ? "New item draft" : "Unsaved item changes"}</span>
            <div className="menu-editor-actions">
              <button className="btn-primary menu-cancel-btn" onClick={handleCancel} disabled={isSaving}>CANCEL</button>
              <button className="btn-primary menu-save-btn" onClick={handleSave} disabled={isSaving}>{isSaving ? "SAVING..." : "SAVE ITEM"}</button>
            </div>
          </div>
        </section>
      )}

      <div className="menu-content-area">
        <div className="menu-table-wrapper">
          <div className="table-scroll-container">
            <table className="menu-table">
              <thead>
                <tr>
                  <th>
                    Category <span className="filter-icon"></span>
                  </th>

                  <th>Name</th>

                  <th>Item Image</th>

                  <th>Price</th>

                    <th className="promo-header">Promotions</th>

                  <th>Availability</th>

                  <th>Description</th>

                  <th>Type</th>

                  <th>Delete</th>
                </tr>
              </thead>

              <tbody>
                {menuItems.map((item, index) => {
                  const rowIsEditing = (editingIndex === index);
                  return (
                    <tr key={index} className={rowIsEditing ? "menu-row-editing" : ""}>
                      <td>
                        {item.category}
                      </td>

                      <td>
                        {item.name && item.name.length > 18 ? item.name.substring(0, 18) + '...' : item.name}
                      </td>

                      <td>
                        <img
                          src={item.image_url || item.image}
                          alt={item.name}
                          className="item-img"
                        />
                      </td>

                      <td>
                        {item.price}
                      </td>

                      <td>
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={Boolean(item.promotions)}
                            onChange={(e) => {
                              const value = e.target.checked;
                              const updatedItems = [...menuItems];
                              updatedItems[index].promotions = value;
                              setMenuItems(updatedItems);
                            }}
                            disabled={isEditingMenu}
                          />

                          <span className="slider round"></span>
                        </label>
                      </td>

                      <td>
                        {item.availability}
                      </td>

                      <td>
                        {item.description && item.description.length > 24 ? item.description.substring(0, 24) + '...' : item.description}
                      </td>



                      <td>
                        {item.type}
                      </td>

                      <td className="menu-actions-cell">
                        <button className="btn-primary" onClick={() => handleEditRow(index)} disabled={isEditingMenu}>
                          {rowIsEditing ? "Editing" : "Edit"}
                        </button>
                        <button
                          className="btn-primary"
                          onClick={() => handleDelete(index)}
                          disabled={isEditingMenu}
                          aria-disabled={isEditingMenu}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MenuPage;
