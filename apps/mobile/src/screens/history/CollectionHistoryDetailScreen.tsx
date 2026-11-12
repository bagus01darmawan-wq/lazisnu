import React, {useEffect, useMemo} from 'react';
import {BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import type {Collection, Task} from '@lazisnu/shared-types';
import {AssignmentStatus} from '@lazisnu/shared-types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {AppCard, AppHeader} from '../../components/ui';
import {Colors, ComponentSizes, Radius, Spacing, Typography} from '../../theme';
import {formatCurrency, formatDate} from '../../utils';
import {KalengInfoCard} from '../scan/KalengInfoCard';

export interface CollectionHistoryDetailScreenProps {
  item: Collection;
  onBack: () => void;
  onCorrect: (item: Collection) => void;
}

const formatCollectedAt = (value: string): string => formatDate(value) || 'Waktu tidak tersedia';

export const CollectionHistoryDetailScreen: React.FC<CollectionHistoryDetailScreenProps> = ({
  item,
  onBack,
  onCorrect,
}) => {
  const insets = useSafeAreaInsets();
  const qrCode = item.can?.qr_code || '-';

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  const task = useMemo<Task>(
    () => ({
      id: item.assignment_id,
      can_id: item.can_id,
      qr_code: qrCode,
      owner_name: item.can?.owner_name || 'Donatur',
      owner_phone: item.can?.owner_phone?.trim() || '',
      owner_address: item.can?.owner_address || '',
      dukuh_name: item.can?.dukuh_name,
      rt: item.can?.rt,
      rw: item.can?.rw,
      status: AssignmentStatus.COMPLETED,
      assigned_at: item.collected_at,
      period: item.period || '',
    }),
    [item, qrCode],
  );

  return (
    <View style={styles.container}>
      <AppHeader variant="stack" title="Detail Penjemputan" onBack={onBack} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom:
              ComponentSizes.bottomTabHeight + Math.max(insets.bottom, Spacing.md) + Spacing.lg,
          },
        ]}
        showsVerticalScrollIndicator={false}>
        <KalengInfoCard task={task} showPeriod />

        <AppCard variant="elevated" style={styles.collectionCard}>
          <Text style={styles.sectionTitle}>Hasil Penjemputan</Text>
          <View style={styles.amountRow} testID="collection-amount-row">
            <View style={styles.amountDetails}>
              <Text style={styles.detailLabel}>Nominal diterima</Text>
              <Text style={styles.amount}>{formatCurrency(Number(item.nominal))}</Text>
            </View>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Koreksi data penjemputan"
              activeOpacity={0.8}
              onPress={() => onCorrect(item)}
              style={styles.correctionButton}>
              <Icon name="pencil-outline" size={16} color={Colors.brand.deepGreen} />
              <Text style={styles.correctionButtonText}>Koreksi</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Waktu penjemputan</Text>
            <Text style={styles.detailValue}>{formatCollectedAt(item.collected_at)}</Text>
          </View>
        </AppCard>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  content: {
    flexGrow: 1,
    gap: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  collectionCard: {padding: Spacing.md, borderWidth: 1, borderColor: Colors.border.warm},
  sectionTitle: {...Typography.heading3, color: Colors.brand.deepGreen, marginBottom: Spacing.sm},
  detailRow: {gap: Spacing.xs},
  detailLabel: {...Typography.caption, color: Colors.text.secondary},
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  amountDetails: {flex: 1, minWidth: 0},
  amount: {...Typography.heading2, color: Colors.brand.emerald},
  correctionButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.brand.deepGreen,
    backgroundColor: Colors.surface.successSubtle,
  },
  correctionButtonText: {...Typography.label, color: Colors.brand.deepGreen},
  detailValue: {...Typography.body, color: Colors.text.primary, fontWeight: '600'},
  divider: {height: 1, backgroundColor: Colors.border.warm, marginVertical: Spacing.sm},
});

export default CollectionHistoryDetailScreen;
