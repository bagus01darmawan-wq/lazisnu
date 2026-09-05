import React, {useMemo, useState} from 'react';
import {StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {Colors, Radius, Spacing, Typography} from '../../theme';

export interface RangeCalendarProps {
  startDate: Date | null;
  endDate: Date | null;
  /** Dipanggil setiap perubahan seleksi; salah satu sisi bisa null. */
  onChange: (start: Date | null, end: Date | null) => void;
  /** Batas rentang dalam hari (inklusif). Default 366. */
  maxSpanDays?: number;
}

const WEEKDAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const isSameDay = (a: Date | null, b: Date | null): boolean =>
  !!a && !!b && startOfDay(a).getTime() === startOfDay(b).getTime();

/**
 * Kalender seleksi rentang tanggal — komponen custom tanpa dependensi baru.
 * Interaksi: tap pertama memilih tanggal mulai; tap kedua (>= mulai) memilih
 * tanggal akhir; tap ketiga mengulang dari awal. Tanggal masa depan dinonaktifkan.
 */
export const RangeCalendar: React.FC<RangeCalendarProps> = ({
  startDate,
  endDate,
  onChange,
  maxSpanDays = 366,
}) => {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const canGoNext = viewYear < today.getFullYear() || viewMonth < today.getMonth();

  const goPrev = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const goNext = () => {
    if (!canGoNext) {
      return;
    }
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const cells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const blanks = Array.from({length: firstWeekday}, () => null);
    const days = Array.from({length: daysInMonth}, (_, i) => i + 1);
    return [...blanks, ...days];
  }, [viewYear, viewMonth]);

  const handleDayPress = (day: number) => {
    const tapped = new Date(viewYear, viewMonth, day);
    if (tapped > today) {
      return;
    }

    // Mulai seleksi baru bila belum ada mulai, atau rentang sudah lengkap.
    if (!startDate || endDate) {
      onChange(tapped, null);
      return;
    }

    // Hanya tanggal mulai yang terpilih.
    const base = startOfDay(startDate);
    if (tapped < base) {
      // Tap sebelum mulai → jadikan tap sebagai mulai baru.
      onChange(tapped, null);
      return;
    }

    const spanDays = Math.round((tapped.getTime() - base.getTime()) / 86400000) + 1;
    if (spanDays > maxSpanDays) {
      // Melebihi batas → ulangi seleksi dari tanggal tap.
      onChange(tapped, null);
      return;
    }
    onChange(base, tapped);
  };

  const renderDay = (day: number | null, index: number) => {
    if (day === null) {
      return <View key={`blank-${index}`} style={styles.dayCell} />;
    }

    const date = new Date(viewYear, viewMonth, day);
    const isFuture = date > today;
    const isStart = isSameDay(date, startDate);
    const isEnd = isSameDay(date, endDate);

    let dayStyle: object = {};
    let textStyle: object = styles.dayText;

    if (isFuture) {
      textStyle = styles.dayTextDisabled;
    } else if ((isStart && !endDate) || isStart || isEnd) {
      dayStyle = styles.dayEndpoint;
      textStyle = styles.dayTextEndpoint;
    } else if (startDate && endDate && date > startOfDay(startDate) && date < startOfDay(endDate)) {
      dayStyle = styles.dayInRange;
      textStyle = styles.dayTextInRange;
    }

    return (
      <TouchableOpacity
        key={`day-${day}`}
        style={[styles.dayCell, dayStyle]}
        disabled={isFuture}
        accessibilityRole={'button'}
        accessibilityLabel={`Pilih tanggal ${day}`}
        onPress={() => handleDayPress(day)}>
        <Text style={textStyle}>{day}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View>
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={'Bulan sebelumnya'}
          onPress={goPrev}
          style={styles.navButton}>
          <Icon name={'chevron-left'} size={22} color={Colors.brand.deepGreen} />
        </TouchableOpacity>
        <Text style={styles.monthLabel}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </Text>
        <TouchableOpacity
          accessibilityRole={'button'}
          accessibilityLabel={'Bulan berikutnya'}
          onPress={goNext}
          disabled={!canGoNext}
          style={styles.navButton}>
          <Icon
            name={'chevron-right'}
            size={22}
            color={canGoNext ? Colors.brand.deepGreen : Colors.text.muted}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAY_LABELS.map(label => (
          <View key={label} style={styles.dayCell}>
            <Text style={styles.weekLabel}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.grid}>{cells.map(renderDay)}</View>
    </View>
  );
};

const DAY_CELL = 40;

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  navButton: {
    padding: Spacing.xs,
  },
  monthLabel: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
  },
  weekRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%` as `${number}%`,
    height: DAY_CELL,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.pill,
  },
  weekLabel: {
    ...Typography.caption,
    color: Colors.text.secondary,
    fontWeight: '600',
  },
  dayText: {
    ...Typography.body,
    color: Colors.text.primary,
  },
  dayTextDisabled: {
    ...Typography.body,
    color: Colors.border.summary,
  },
  dayEndpoint: {
    backgroundColor: Colors.brand.emerald,
  },
  dayTextEndpoint: {
    ...Typography.body,
    color: Colors.text.white,
    fontWeight: '700',
  },
  dayInRange: {
    backgroundColor: Colors.surface.successSubtle,
    borderRadius: 0,
  },
  dayTextInRange: {
    ...Typography.body,
    color: Colors.status.success,
  },
});

export default RangeCalendar;
