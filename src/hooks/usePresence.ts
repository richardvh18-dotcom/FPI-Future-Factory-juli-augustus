import { useEffect, useRef, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { PATHS, getPathString } from '../config/dbPaths';

const PING_INTERVAL_MS = 60 * 1000; // 1 minute
const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export const usePresence = () => {
  const [isActive, setIsActive] = useState(true);
  const lastActivityRef = useRef<number>(Date.now());
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updatePresence = async (status: 'online' | 'idle') => {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const userRef = doc(db, getPathString(PATHS.USERS), user.uid);
      await setDoc(
        userRef,
        {
          presenceStatus: status,
          lastActiveAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.warn('Failed to update presence status', error);
    }
  };

  const handleActivity = () => {
    lastActivityRef.current = Date.now();
    if (!isActive) {
      setIsActive(true);
      updatePresence('online');
    }

    // Reset idle timeout
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    idleTimeoutRef.current = setTimeout(() => {
      setIsActive(false);
      updatePresence('idle');
    }, IDLE_TIMEOUT_MS);
  };

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        // Initiele ping wanneer gebruiker is ingelogd
        updatePresence('online');
        setIsActive(true);
        lastActivityRef.current = Date.now();

        // Start ping interval (update the timestamp every minute if active)
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          if (Date.now() - lastActivityRef.current < IDLE_TIMEOUT_MS) {
            updatePresence('online');
          }
        }, PING_INTERVAL_MS);

        // Start initial idle timeout
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = setTimeout(() => {
          setIsActive(false);
          updatePresence('idle');
        }, IDLE_TIMEOUT_MS);
      } else {
        // Gebruiker is uitgelogd
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      }
    });

    // Add activity listeners
    const events = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));

    // Cleanup when component unmounts or browser closes
    const handleBeforeUnload = () => {
      if (auth.currentUser) {
        // Attempt a quick offline write (might not complete but good to try)
        updatePresence('idle'); 
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      unsubscribeAuth();
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      events.forEach((event) => window.removeEventListener(event, handleActivity));
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return isActive;
};
