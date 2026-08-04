import { useEffect } from 'react';

/**
 * Hook to automatically lock screen orientation to portrait on smaller devices (like scanners or phones),
 * while allowing larger devices (like tablets or desktops) to rotate freely.
 */
export const useScreenOrientationLock = (maxWidth = 768) => {
  useEffect(() => {
    const lockOrientation = async () => {
      // Check if the device is a small screen (mobile/scanner)
      if (window.innerWidth <= maxWidth) {
        try {
          if ('orientation' in screen && 'lock' in screen.orientation) {
            // @ts-ignore - TS might not fully support the experimental Screen Orientation API
            await screen.orientation.lock('portrait');
            console.log('Screen orientation locked to portrait for small device.');
          }
        } catch (error) {
          console.warn('Could not lock screen orientation:', error);
        }
      } else {
        try {
          if ('orientation' in screen && 'unlock' in screen.orientation) {
            screen.orientation.unlock();
            console.log('Screen orientation unlocked for large device.');
          }
        } catch (error) {
          console.warn('Could not unlock screen orientation:', error);
        }
      }
    };

    // Run on mount
    lockOrientation();

    // Optionally handle resize events if device changes, though unlikely for physical devices
    window.addEventListener('resize', lockOrientation);
    return () => window.removeEventListener('resize', lockOrientation);
  }, [maxWidth]);
};
