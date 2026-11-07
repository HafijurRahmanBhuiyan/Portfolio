'use client';
import { useEffect } from 'react';
export default function AdminBehavior() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = '/js/admin.js';
    document.body.appendChild(script);
    return () => script.remove();
  }, []);
  return null;
}
