import React, { useState, useEffect } from 'react';
import { useNotification } from '../hooks/useNotification';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';
import './NotificationPage.css';

const NotificationPage = () => {
  const [activeTab, setActiveTab] = useState('recent');
  const { activities } = useNotification();
  const [feedbackList, setFeedbackList] = useState([]);
  const [loadingFeedbacks, setLoadingFeedbacks] = useState(false);

  // Fetch feedbacks from Firestore
  useEffect(() => {
    if (activeTab !== 'feedback') return;

    const loadFeedbacks = async () => {
      setLoadingFeedbacks(true);
      try {
        console.log('🔍 Fetching feedbacks from Firestore...');
        const customersRef = collection(db, 'Restaurant', 'orderin_restaurant_1', 'customers');
        const snapshot = await getDocs(customersRef);

        console.log('📊 Total customer documents:', snapshot.docs.length);

        const allFeedbacks = [];

        snapshot.forEach((customerDoc) => {
          const customerData = customerDoc.data();
          const phoneNumber = customerDoc.id;
          const customerNames = Array.isArray(customerData?.names) ? customerData.names : [];
          const feedbacksArray = Array.isArray(customerData?.feedback) ? customerData.feedback : [];

          console.log(`👤 Customer ${phoneNumber}:`, {
            hasNames: customerNames.length > 0,
            hasFeedbacks: feedbacksArray.length > 0,
            names: customerNames,
            feedbacks: feedbacksArray,
          });

          // Extract feedbacks from this customer
          feedbacksArray.forEach((feedbackItem, idx) => {
            const starRating = feedbackItem.stars ?? feedbackItem.rating ?? 0;
            const feedbackText = feedbackItem.text ?? feedbackItem.message ?? '';
            const feedbackTime = feedbackItem.time
              ? typeof feedbackItem.time.toDate === 'function'
                ? feedbackItem.time.toDate()
                : new Date(feedbackItem.time.seconds ? feedbackItem.time.seconds * 1000 : feedbackItem.time)
              : new Date();

            const customerName =
              feedbackItem.name || customerNames[idx] || customerNames[customerNames.length - 1] || 'Anonymous';

            allFeedbacks.push({
              id: `${phoneNumber}-${idx}`,
              phone: phoneNumber,
              name: customerName,
              stars: starRating,
              text: feedbackText,
              time: feedbackTime,
            });

            console.log(`⭐ Feedback extracted:`, {
              customer: customerName,
              stars: starRating,
              text: feedbackText,
              time: feedbackTime,
            });
          });
        });

        // Sort by latest first
        allFeedbacks.sort((a, b) => new Date(b.time) - new Date(a.time));

        console.log('✅ Total feedbacks loaded:', allFeedbacks.length);
        console.log('📋 Feedback list:', allFeedbacks);

        setFeedbackList(allFeedbacks);
      } catch (error) {
        console.error('❌ Error loading feedbacks:', error);
        setFeedbackList([]);
      } finally {
        setLoadingFeedbacks(false);
      }
    };

    loadFeedbacks();
  }, [activeTab]);

  // Helper: Format date/time
  const formatDateTime = (dateObj) => {
    if (!dateObj) return 'Unknown';
    try {
      const date = new Date(dateObj);
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return String(dateObj);
    }
  };

  // Helper: Render star rating
  const renderStarRating = (rating) => {
    const count = Math.max(0, Math.min(5, Math.round(rating || 0)));
    const stars = [];

    for (let i = 0; i < count; i++) {
      stars.push(
        <span key={`filled-${i}`} className="star filled">
          ★
        </span>
      );
    }

    for (let i = count; i < 5; i++) {
      stars.push(
        <span key={`empty-${i}`} className="star empty">
          ☆
        </span>
      );
    }

    return <span className="stars-container">{stars}</span>;
  };

  // Render Recent Activities tab
  const renderRecentActivities = () => {
    if (!activities || activities.length === 0) {
      return <div className="empty-state">No recent activities</div>;
    }

    return (
      <div className="activities-container">
        {activities.map((activity, index) => (
          <div key={index} className="activity-item">
            <div className="activity-icon">📌</div>
            <div className="activity-content">
              <p className="activity-message">{activity.message}</p>
              {activity.timestamp && <span className="activity-time">{formatDateTime(activity.timestamp)}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render Feedback tab
  const renderFeedback = () => {
    if (loadingFeedbacks) {
      return <div className="empty-state">Loading feedbacks...</div>;
    }

    if (!feedbackList || feedbackList.length === 0) {
      return <div className="empty-state">No feedbacks available</div>;
    }

    return (
      <div className="feedbacks-container">
        {feedbackList.map((feedback, idx) => (
          <div
            key={feedback.id}
            className="feedback-item"
            style={{ borderLeftColor: ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444'][idx % 5] }}
          >
            <div className="feedback-index">{idx + 1}</div>

            <div className="feedback-section feedback-header-section">
              <div className="feedback-customer">
                <span className="customer-icon">👤</span>
                <span className="customer-name">{feedback.name}</span>
              </div>
              <div className="feedback-phone">
                <span className="phone-icon">📱</span>
                <span className="phone-number">{feedback.phone}</span>
              </div>
            </div>

            <div className="feedback-divider"></div>

            <div className="feedback-section feedback-rating-section">
              <span className="rating-label">Rating:</span>
              <div className="rating-stars">{renderStarRating(feedback.stars)}</div>
            </div>

            <div className="feedback-divider"></div>

            <div className="feedback-section feedback-text-section">
              <span className="text-label">💬 Comment:</span>
              <p className="feedback-comment">{feedback.text || 'No comment provided'}</p>
            </div>

            <div className="feedback-divider"></div>

            <div className="feedback-section feedback-footer-section">
              <span className="time-icon">🕐</span>
              <span className="feedback-timestamp">{formatDateTime(feedback.time)}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="notification-page">
      <h1 className="page-title">Notifications</h1>

      <div className="tab-bar">
        <button
          className={`tab-button ${activeTab === 'recent' ? 'active' : ''}`}
          onClick={() => setActiveTab('recent')}
        >
          📋 Recent Activities
        </button>
        <button
          className={`tab-button ${activeTab === 'feedback' ? 'active' : ''}`}
          onClick={() => setActiveTab('feedback')}
        >
          ⭐ Feedback
        </button>
      </div>

      <div className="tab-content-area">
        {activeTab === 'recent' && renderRecentActivities()}
        {activeTab === 'feedback' && renderFeedback()}
      </div>
    </div>
  );
};

export default NotificationPage;
