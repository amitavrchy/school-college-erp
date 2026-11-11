'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
export function useData<T = any>(path: string | null) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setLoading(true); setError('');
    try { setData(await api<T>(path)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => { const listener = () => { void reload(); }; window.addEventListener('campus-refresh',listener); return () => window.removeEventListener('campus-refresh',listener); }, [reload]);
  return { data, error, loading, reload };
}
