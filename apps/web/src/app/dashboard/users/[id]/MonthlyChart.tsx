'use client';

import React from 'react';
import { Card } from '@/components/ui/Card';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface MonthlyChartProps {
  data: { month: number; year: number; count: number; amount: number }[];
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export function MonthlyChart({ data }: MonthlyChartProps) {
  const chartData = data.map((item) => ({
    name: monthNames[item.month - 1],
    count: item.count,
    amount: item.amount,
  }));

  const formatCurrency = (value: number) => {
    if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}M`;
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}jt`;
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}rb`;
    return value.toString();
  };

  return (
    <Card variant="glass" className="relative overflow-hidden">
      <div className="bg-white/3 -m-6 p-6">
        <h3 className="text-sm font-black text-[#F4F1EA] uppercase tracking-widest mb-6">
          Performa per Bulan
        </h3>

        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6B9E9F" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6B9E9F" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAmount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EAD19B" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EAD19B" stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(244, 241, 234, 0.08)" />

              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#F4F1EA', fontWeight: 600 }}
                dy={10}
              />

              <YAxis
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#6B9E9F', fontWeight: 600 }}
                allowDecimals={false}
              />

              <YAxis
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#EAD19B', fontWeight: 600 }}
                tickFormatter={(value) => formatCurrency(Number(value))}
              />

              <Tooltip
                contentStyle={{
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  backgroundColor: '#2C473E',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3)',
                  fontSize: '12px',
                  color: '#F4F1EA',
                }}
                formatter={(value, name) => {
                  if (name === 'Jumlah Jemput') return [`${value}x`, name];
                  return [`Rp ${Number(value).toLocaleString('id-ID')}`, name];
                }}
              />

              <Legend
                verticalAlign="top"
                height={36}
                iconType="circle"
                formatter={(value) => (
                  <span className="text-[10px] font-bold text-[#F4F1EA]/60 uppercase tracking-wider">
                    {value}
                  </span>
                )}
              />

              <Area
                yAxisId="left"
                type="monotone"
                dataKey="count"
                name="Jumlah Jemput"
                stroke="#6B9E9F"
                strokeWidth={3}
                fill="url(#colorCount)"
                fillOpacity={1}
                isAnimationActive={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#6B9E9F' }}
              />

              <Area
                yAxisId="right"
                type="monotone"
                dataKey="amount"
                name="Nominal"
                stroke="#EAD19B"
                strokeWidth={3}
                fill="url(#colorAmount)"
                fillOpacity={1}
                isAnimationActive={false}
                activeDot={{ r: 5, strokeWidth: 0, fill: '#EAD19B' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
