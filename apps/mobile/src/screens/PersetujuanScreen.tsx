import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {c1Service, type PeriodDraftDto, type StafSummaryDto} from '../services/api';
import {AppButton} from '../components/ui/AppButton';
import {AppCard} from '../components/ui/AppCard';
import {AppHeader} from '../components/ui/AppHeader';
import {StatusBadge} from '../components/ui/StatusBadge';
import {PeriodChip} from '../components/PeriodChip';
import {Colors, Spacing, Typography} from '../theme';
import {getErrorMessage} from '../utils/error';
import {reminderFor} from '../roles/roleMap';

/**
 * C1-T9 — Layar Staf Pengumpulan (setuju/monitor).
 * Ringkasan scope + daftar draft (PENDING/ESCALATED/APPROVED) + tombol setujui.
 * Staf tak bisa FINAL/kunci/ubah nominal — hanya setuju (server menegakkan).
 */
export const PersetujuanScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [summary, setSummary] = useState<StafSummaryDto | null>(null);
  const [drafts, setDrafts] = useState<PeriodDraftDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [sumRes, draftRes] = await Promise.all([
        c1Service.getStafSummary(),
        c1Service.getDrafts(),
      ]);
      if (!sumRes.success || !sumRes.data)
        throw new Error(sumRes.error?.message || 'Gagal memuat ringkasan');
      setSummary(sumRes.data);
      if (draftRes.success && draftRes.data) setDrafts(draftRes.data);
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Gagal memuat data persetujuan'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = useCallback(
    async (id: string) => {
      setApprovingId(id);
      try {
        const res = await c1Service.approveDraft(id);
        if (!res.success) throw new Error(res.error?.message || 'Gagal menyetujui');
        await load();
      } catch (e: unknown) {
        Alert.alert('Gagal', getErrorMessage(e, 'Gagal menyetujui draft'));
      } finally {
        setApprovingId(null);
      }
    },
    [load],
  );

  const reminder =
    summary && summary.ppk.total_count > summary.ppk.final_count
      ? reminderFor(
          {
            period: summary.period,
            period_status: summary.period_status,
            days_to_due: summary.days_to_due,
            days_to_lock: summary.days_to_lock,
            in_tolerance: summary.in_tolerance,
          },
          summary.ppk.total_count - summary.ppk.final_count,
        )
      : null;

  return (
    <View style={[styles.container, {paddingTop: insets.top}]}>
      <AppHeader title="Persetujuan Tugas" variant="main" />
      <ScrollView
        contentContainerStyle={styles.body}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}>
        {error ? (
          <AppCard>
            <Text style={styles.error}>{error}</Text>
          </AppCard>
        ) : null}
        {summary ? (
          <AppCard>
            <Text style={styles.period}>{summary.period}</Text>
            <Text style={styles.meta}>
              Draft: {summary.drafts.pending} menunggu • {summary.drafts.escalated} eskalasi •{' '}
              {summary.drafts.approved} disetujui
            </Text>
            <Text style={styles.meta}>
              PPK FINAL: {summary.ppk.final_count}/{summary.ppk.total_count} • Tugas aktif:{' '}
              {summary.tugas_active}
            </Text>
            {reminder && reminder.level !== 'none' ? (
              <Text style={styles.reminder}>{reminder.text}</Text>
            ) : null}
          </AppCard>
        ) : null}
        {drafts.map(d => (
          <AppCard key={d.id}>
            <View style={styles.rowBetween}>
              <Text style={styles.branch}>{d.branch_name}</Text>
              <StatusBadge
                status={
                  d.status === 'APPROVED'
                    ? 'success'
                    : d.event_kind === 'ESCALATED'
                      ? 'warning'
                      : 'pending'
                }
                label={d.event_kind}
              />
            </View>
            <Text style={styles.meta}>
              {d.item_count} kaleng • {d.period}
            </Text>
            {d.status !== 'APPROVED' ? (
              <AppButton
                label={approvingId === d.id ? 'Menyetujui…' : 'Setujui'}
                onPress={() => approve(d.id)}
                disabled={approvingId === d.id}
                loading={approvingId === d.id}
              />
            ) : null}
          </AppCard>
        ))}
        {isLoading && !summary ? <ActivityIndicator size="large" /> : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  body: {padding: Spacing.lg, gap: Spacing.md},
  rowBetween: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  period: {...Typography.heading3, fontWeight: '700'},
  branch: {...Typography.heading3, fontWeight: '700', flex: 1},
  meta: {...Typography.body, color: Colors.text.muted, marginTop: Spacing.xs},
  reminder: {
    ...Typography.body,
    color: Colors.status.warning,
    fontWeight: '700',
    marginTop: Spacing.sm,
  },
  error: {...Typography.body, color: Colors.status.error},
});

export default PersetujuanScreen;
