import React, { createContext, useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const NotificationContext = createContext();

const RESTAURANT_ID = "orderin_restaurant_1";

const toDate = (value) => {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  if (typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  return new Date();
};

export const NotificationProvider = ({ children }) => {
  const [activities, setActivities] = useState([]);

  // Fetch all activities from Firestore on mount
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        console.log(`fetchActivities - collection path: Restaurant/${RESTAURANT_ID}/inventory, project:`, db?.app?.options?.projectId);
        const inventoryCollection = collection(db, "Restaurant", RESTAURANT_ID, "inventory");
        const inventorySnapshot = await getDocs(inventoryCollection);
        const allActions = [];
        inventorySnapshot.docs.forEach(inventoryDoc => {
          const item = inventoryDoc.data();
          if (item.actions && Array.isArray(item.actions)) {
            item.actions.forEach(action => {
              const actionDate = toDate(action.timestamp);
              allActions.push({
                id: `inventory-${inventoryDoc.id}-${actionDate.getTime()}-${action.type}`,
                message: `${item.name} of ${item.itemCategory} is ${action.type}d ${action.quantity} ${item.unit} at ${item.locationOfStorage}`,
                timestamp: actionDate.toISOString(),
                sortTime: actionDate.getTime()
              });
            });
          }
        });

        const notificationsCollection = collection(db, "Restaurant", RESTAURANT_ID, "notifications");
        const notificationsSnapshot = await getDocs(notificationsCollection);
        notificationsSnapshot.docs.forEach(notificationDoc => {
          const notification = notificationDoc.data();
          if (!notification.message) return;
          const notificationDate = toDate(notification.createdAt || notification.timestamp);
          allActions.push({
            id: notificationDoc.id,
            message: notification.message,
            timestamp: notificationDate.toISOString(),
            sortTime: notificationDate.getTime(),
            type: notification.type || 'notification'
          });
        });

        allActions.sort((a, b) => b.sortTime - a.sortTime);
        setActivities(allActions);
      } catch (error) {
        console.error("Error fetching activities:", error, 'project:', db?.app?.options?.projectId);
      }
    };
    fetchActivities();
  }, []);

  const addActivity = async (message, options = {}) => {
    const now = new Date();
    const newActivity = {
      id: `local-${Date.now()}`,
      message,
      timestamp: now.toISOString(),
      sortTime: now.getTime(),
      type: options.type || 'activity'
    };
    setActivities(prev => [newActivity, ...prev]);

    if (!options.persist) return;

    try {
      const notificationsCollection = collection(db, "Restaurant", RESTAURANT_ID, "notifications");
      await addDoc(notificationsCollection, {
        message,
        type: options.type || 'activity',
        source: options.source || 'app',
        itemId: options.itemId || null,
        itemName: options.itemName || null,
        timestamp: Timestamp.fromDate(now),
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error("Error storing activity notification:", error, 'project:', db?.app?.options?.projectId);
    }
  };

  return (
    <NotificationContext.Provider value={{ activities, addActivity }}>
      {children}
    </NotificationContext.Provider>
  );
};
