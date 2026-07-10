'use client';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { analyticsApi } from '@/lib/api';
import type { Analytics } from '../types';

// Data hook cho analytics — giữ nguyên hành vi loading/error/data + filter days như page cũ.
export function useAnalytics(initialDays = 30) {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(initialDays);

  useEffect(() => {
    loadData();
  }, [days]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: res } = await analyticsApi.get({ days });
      setData(res);
    } catch (e) {
      toast.error('Lỗi tải dữ liệu thống kê');
    } finally {
      setLoading(false);
    }
  };

  return { data, loading, days, setDays };
}
