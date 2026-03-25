import React, { useRef, useState, useEffect } from 'react';
import LabelVisualPreview from './LabelVisualPreview';

const PIXELS_PER_MM = 3.78;

/**
 * AutoScaledLabelPreview
 * Een wrapper die de LabelVisualPreview automatisch schaalt zodat deze in de container past.
 */
const AutoScaledLabelPreview = ({ label, data, className = "", maxScale = 3, printerDpi = 203 }) => {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!label || !containerRef.current) return;

    const calculateScale = () => {
      if (!containerRef.current) return;
      
      const { width } = containerRef.current.getBoundingClientRect();
      const labelWidthPx = label.width * PIXELS_PER_MM;
      
      if (labelWidthPx === 0) return;

      // Bereken schaal om te passen
      let newScale = width / labelWidthPx;
      
      // Beperk maximale vergroting
      if (newScale > maxScale) newScale = maxScale;
      
      setScale(newScale);
    };

    // Observer voor formaatwijzigingen
    const observer = new ResizeObserver(calculateScale);
    observer.observe(containerRef.current);
    
    // Initiële berekening
    calculateScale();

    return () => observer.disconnect();
  }, [label, maxScale]);

  if (!label) return null;

  return (
    <div ref={containerRef} className={`w-full flex justify-center items-center overflow-hidden ${className}`}>
      <LabelVisualPreview label={label} data={data} zoom={scale} printerDpi={printerDpi} />
    </div>
  );
};

export default AutoScaledLabelPreview;