import React, { useState, useEffect } from 'react';
import { FiUpload, FiTrash2 } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, Timestamp, query, where, orderBy, getDocs, deleteDoc, doc } from 'firebase/firestore';
import storageService from '../services/storageService';

const RESTAURANT_NUMBER = import.meta.env.VITE_RESTAURANT_NUMBER || '0';
import routes from '../routes';
import './Promotions.css';

const Promotions = () => {
    const navigate = useNavigate();
    const [caption, setCaption] = useState('');
    const [description, setDescription] = useState('');
    const [duration, setDuration] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [promotions, setPromotions] = useState([]);
    const [loadingPromotions, setLoadingPromotions] = useState(true);

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const previewUrl = URL.createObjectURL(file);
            setImagePreview(previewUrl);
        }
    };

    // Fetch existing promotions
    useEffect(() => {
        fetchPromotions();
    }, []);

    // Periodically re-fetch promotions to auto-clean expired promotions (runs every minute)
    useEffect(() => {
        const interval = setInterval(() => {
            fetchPromotions();
        }, 60 * 1000); // 60 seconds
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        return () => {
            if (imagePreview) {
                URL.revokeObjectURL(imagePreview);
            }
        };
    }, [imagePreview]);

    const fetchPromotions = async () => {
        try {
            setLoadingPromotions(true);
            const promotionsRef = collection(db, 'Restaurant', 'orderin_restaurant_2', 'promotions');
            const q = query(promotionsRef, orderBy('createdAt', 'desc'));
            const querySnapshot = await getDocs(q);

            const now = Timestamp.now();
            const promotionsList = [];

            for (const docSnap of querySnapshot.docs) {
                const promoData = docSnap.data();

                // Check if promotion has expired
                let isExpired = false;
                if (promoData.expiryAt) {
                    const expiryTime = promoData.expiryAt;
                    isExpired = now.seconds > expiryTime.seconds;
                }

                if (isExpired) {
                    // Auto-delete expired promotion
                    try {
                        // If a storage path exists, try to delete the image first
                        if (promoData.image_path) {
                            try {
                                await storageService.deleteFileByPath(promoData.image_path);
                            } catch (err) {
                                console.error('Error deleting expired promotion image via storage path:', err);
                            }
                        } else if (promoData.image_delete_hash || promoData.image_id) {
                            // Legacy external image metadata found — skip automatic deletion for safety
                            console.warn('Legacy external image metadata present on expired promotion; automatic deletion is skipped.');
                        } else if (promoData.imageStoragePath) {
                            // legacy Firebase-stored image - do not auto-delete
                            console.warn('Found a legacy Firebase image on expired promotion; automatic deletion is disabled.');
                        }

                        await deleteDoc(doc(promotionsRef, docSnap.id));

                        console.log(`Auto-deleted expired promotion: ${promoData.caption}`);
                    } catch (deleteError) {
                        console.error('Error deleting expired promotion:', deleteError);
                    }
                } else {
                    // Promotion is still active, add to list
                    promotionsList.push({
                        id: docSnap.id,
                        ...promoData,
                        imageUrl: promoData.image_url || promoData.imageUrl || null,
                        image_path: promoData.image_path || promoData.imageStoragePath || null,
                    });
                }
            }

            setPromotions(promotionsList);
        } catch (error) {
            console.error('Error fetching promotions:', error);
        } finally {
            setLoadingPromotions(false);
        }
    };

    const calculateExpiryAt = (durationStr) => {
        const now = Timestamp.now();
        let durationMs = 0;

        switch (durationStr) {
            case '1hour': durationMs = 1 * 60 * 60 * 1000; break;
            case '2hours': durationMs = 2 * 60 * 60 * 1000; break;
            case '3hours': durationMs = 3 * 60 * 60 * 1000; break;
            case '6hours': durationMs = 6 * 60 * 60 * 1000; break;
            case '12hours': durationMs = 12 * 60 * 60 * 1000; break;
            case '1day': durationMs = 1 * 24 * 60 * 60 * 1000; break;
            case '2days': durationMs = 2 * 24 * 60 * 60 * 1000; break;
            case '3days': durationMs = 3 * 24 * 60 * 60 * 1000; break;
            case '1week': durationMs = 7 * 24 * 60 * 60 * 1000; break;
            case '2weeks': durationMs = 14 * 24 * 60 * 60 * 1000; break;
            case '3weeks': durationMs = 21 * 24 * 60 * 60 * 1000; break;
            case '1month': durationMs = 30 * 24 * 60 * 60 * 1000; break; // Approximate
            case '2months': durationMs = 60 * 24 * 60 * 60 * 1000; break;
            case '3months': durationMs = 90 * 24 * 60 * 60 * 1000; break;
            case '6months': durationMs = 180 * 24 * 60 * 60 * 1000; break;
            case '1year': durationMs = 365 * 24 * 60 * 60 * 1000; break;
            default: durationMs = 0;
        }

        return new Timestamp(now.seconds + Math.floor(durationMs / 1000), now.nanoseconds);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!imageFile || !caption || !description || !duration) {
            alert('Please fill all fields and select an image.');
            return;
        }

        // Proceed with upload (images are stored in Firebase Storage).

        setLoading(true);

        try {
                // Upload image to Firebase Storage (throws on failure)
                let image_url, image_path, image_name;
                try {
                    const result = await storageService.uploadFile(imageFile, 'promotions', RESTAURANT_NUMBER);
                    image_url = result.image_url || null;
                    image_path = result.image_path || null;
                    image_name = result.image_name || null;
                } catch (err) {
                    console.error('Promotion image upload failed:', err);
                    alert('Image upload failed. Please try again.');
                    setLoading(false);
                    return;
                }

                // Calculate expiryAt
                const expiryAt = calculateExpiryAt(duration);

                // Save to Firestore (store canonical storage metadata)
                const promotionsRef = collection(db, 'Restaurant', 'orderin_restaurant_2', 'promotions');
                const docRef = await addDoc(promotionsRef, {
                    image_url,
                    image_path,
                caption,
                description,
                duration,
                createdAt: serverTimestamp(),
                expiryAt,
                isActive: true,
                createdBy: 'admin'
            });

            console.log('Promotion created successfully with ID:', docRef.id);
            alert('Promotion created successfully!');
            // Reset form
            setCaption('');
            setDescription('');
            setDuration('');
            setImageFile(null);
            setImagePreview(null);
            // Refresh promotions list
            await fetchPromotions();
        } catch (error) {
            console.error('Error creating promotion:', error);
            console.error('Error details:', error.message, error.code);
            alert('Error creating promotion. Please check console for details: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePromotion = async (promotionId) => {
        if (!window.confirm('Are you sure you want to delete this promotion?')) {
            return;
        }

        try {
            // Get promotion metadata locally (to delete image from storage)
            const promotion = promotions.find(p => p.id === promotionId) || null;
            const promotionsRef = collection(db, 'Restaurant', 'orderin_restaurant_2', 'promotions');

            // If a storage path exists, try to delete the image first (best-effort)
            if (promotion?.image_path) {
                try {
                    await storageService.deleteFileByPath(promotion.image_path);
                } catch (err) {
                    console.error('Error deleting promotion image via storage path:', err);
                }
            } else if (promotion?.image_delete_hash || promotion?.image_id) {
                console.warn('Legacy external image metadata present on promotion; automatic deletion is skipped.');
            } else if (promotion?.imageStoragePath) {
                console.warn('Found a legacy Firebase image on promotion; automatic deletion is disabled.');
            }

            // Delete the Firestore document (do this even if storage deletion failed)
            await deleteDoc(doc(promotionsRef, promotionId));

            alert('Promotion deleted successfully!');
            fetchPromotions();
        } catch (error) {
            console.error('Error deleting promotion:', error);
            alert('Error deleting promotion. Please try again.');
        }
    };

    const formatDate = (timestamp) => {
        if (!timestamp) return 'N/A';
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    };

    return (
        <div className="promotions-page-container">
            <div className="promotions-page-content">
                {/* Back Button - match Finance/Orders/Menu/Inventory style */}
                <button className="fin-back-btn" onClick={() => navigate(routes.dashboard)}>
                    Back
                </button>

                {/* Title */}
                <h2 className="promotions-title">
                    CREATE POP AD
                </h2>

                <form onSubmit={handleSubmit}>
                    <div className="promotions-content">
                        {/* Upload Section */}
                        <div className="promotions-upload-section">
                        <div className="promotions-upload-box">
                            {imagePreview ? (
                                <img
                                    src={imagePreview}
                                    alt="Selected"
                                    className="promotions-image-preview"
                                />
                            ) : (
                                <>
                                    <FiUpload className="promotions-upload-icon" />
                                    <p className="promotions-upload-text">
                                        Upload advertisement picture
                                    </p>
                                </>
                            )}
                            {/* File input styled to cover the box for click area */}
                            <input
                                type="file"
                                accept="image/*"
                                className="promotions-file-input"
                                onChange={handleFileChange}
                            />
                        </div>
                        </div>

                        {/* Input Section */}
                        <div className="promotions-input-section">
                            <label className="promotions-label">
                                Caption
                            </label>
                            <textarea
                                placeholder="Enter Caption (if any)"
                                className="promotions-textarea promotions-textarea-caption"
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                required
                            ></textarea>

                            <label className="promotions-label">
                                Description
                            </label>
                            <textarea
                                placeholder="Enter Description (if any)"
                                className="promotions-textarea promotions-textarea-description"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                required
                            ></textarea>

                            <label className="promotions-label">
                                Duration
                            </label>
                            <select
                                className="promotions-select"
                                value={duration}
                                onChange={(e) => setDuration(e.target.value)}
                                required
                            >
                                <option value="">Select Duration</option>
                                <option value="1hour">1 hour</option>
                                <option value="2hours">2 hours</option>
                                <option value="3hours">3 hours</option>
                                <option value="6hours">6 hours</option>
                                <option value="12hours">12 hours</option>
                                <option value="1day">1 day</option>
                                <option value="2days">2 days</option>
                                <option value="3days">3 days</option>
                                <option value="1week">1 week</option>
                                <option value="2weeks">2 weeks</option>
                                <option value="3weeks">3 weeks</option>
                                <option value="1month">1 month</option>
                                <option value="2months">2 months</option>
                                <option value="3months">3 months</option>
                                <option value="6months">6 months</option>
                                <option value="1year">1 year</option>
                            </select>

                            {/* Submit Button */}
                            <button type="submit" className="promotions-submit-btn" disabled={loading}>
                                {loading ? 'Submitting...' : 'Submit'}
                            </button>
                        </div>
                    </div>
                </form>

                {/* Promotions List Section */}
                <div className="promotions-list-container">
                    <h2 className="promotions-list-title">Active Promotions</h2>
                    
                    {loadingPromotions ? (
                        <div className="promotions-loading">Loading promotions...</div>
                    ) : promotions.length === 0 ? (
                        <div className="promotions-no-data">No promotions available</div>
                    ) : (
                        <div className="promotions-grid">
                            {promotions.map((promo) => (
                                <div key={promo.id} className="promotion-card">
                                    <div className="promotion-image-container">
                                        <img 
                                            src={promo.imageUrl} 
                                            alt={promo.caption}
                                            className="promotion-image"
                                        />
                                        <button 
                                            className="promotion-delete-btn"
                                            onClick={() => handleDeletePromotion(promo.id)}
                                        >
                                            <FiTrash2 />
                                        </button>
                                    </div>
                                    <div className="promotion-details">
                                        <h3 className="promotion-caption">{promo.caption}</h3>
                                        <p className="promotion-description">{promo.description}</p>
                                        <div className="promotion-meta">
                                            <span>Duration: {promo.duration}</span>
                                            <span>Created: {formatDate(promo.createdAt)}</span>
                                        </div>
                                        <div className="promotion-meta">
                                            <span>Expires: {formatDate(promo.expiryAt)}</span>
                                            <span className={promo.isActive ? 'status-active' : 'status-inactive'}>
                                                {promo.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Promotions;
