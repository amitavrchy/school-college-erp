'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
export function useData<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    const request = ++sequence.current;
    setLoading(true); setError('');
    try { const result = await api<T>(path); if(request === sequence.current) setData(result); } catch (e) { if(request === sequence.current) setError((e as Error).message); } finally { if(request === sequence.current) setLoading(false); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { const listener = () => { void reload(); }; window.addEventListener('campus-refresh',listener); return () => window.removeEventListener('campus-refresh',listener); }, [reload]);
  return { data, error, loading, reload };
}
