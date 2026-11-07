'use client';
import { useEffect } from 'react';
export default function PortfolioBehavior() {
  useEffect(() => {
    let cancelled = false;
    function load(src) {
      return new Promise((resolve) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = resolve;
        document.body.appendChild(script);
      });
    }
    load('/js/projects.js').then(() => {
      if (!cancelled) return load('/js/script.js');
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
