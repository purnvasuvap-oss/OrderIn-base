import React, { createContext, useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

export const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const [activities, setActivities] = useState([]);

  // Fetch all activities from Firestore on mount
  useEffect(() => {
    const fetchActivities = async () => {
      try {
        console.log('fetchActivities - collection path: Restaurant/orderin_restaurant_1/inventory, project:', db?.app?.options?.projectId);
        const inventoryCollection = collection(db, "Restaurant", "orderin_restaurant_1", "inventory");
        const inventorySnapshot = await getDocs(inventoryCollection);
        const allActions = [];
        inventorySnapshot.docs.forEach(doc => {
          const item = doc.data();
          if (item.actions && Array.isArray(item.actions)) {
            item.actions.forEach(action => {
              allActions.push({
                id: action.timestamp.toMillis(),
                message: `${item.name} of ${item.itemCategory} is ${action.type}d ${action.quantity} ${item.unit} at ${item.locationOfStorage}`,
                timestamp: action.timestamp.toDate().toLocaleString('en-GB', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })
              });
            });
          }
        });
        allActions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        setActivities(allActions);
      } catch (error) {
        console.error("Error fetching activities:", error, 'project:', db?.app?.options?.projectId);
      }
    };
    fetchActivities();
  }, []);

  const addActivity = (message) => {
    const now = new Date();
    const timestamp = now.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const newActivity = { id: Date.now(), message, timestamp };
    setActivities(prev => [newActivity, ...prev]);
  };

  return (
    <NotificationContext.Provider value={{ activities, addActivity }}>
      {children}
    </NotificationContext.Provider>
  );
};
