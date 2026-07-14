import React from 'react';
import {Alert, ScrollView, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore} from '../stores';
import {AppButton, AppCard, StatusBadge} from '../components/ui';
import {Colors, Layout, Radius, Shadows, Spacing, Typography} from '../theme';

const roleLabels: Record<string, string> = {
  PETUGAS: 'Petugas Penjemputan',
  ADMIN_RANTING: 'Admin Ranting',
  ADMIN_KECAMATAN: 'Admin Kecamatan',
  BENDAHARA: 'Bendahara',
};

const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {user, logout} = useAuthStore();
  const role = user?.role ? roleLabels[user.role] || user.role : 'Petugas';

  const handleLogout = () => {
    Alert.alert(
      'Konfirmasi Keluar',
      'Apakah Anda yakin ingin keluar dari aplikasi?',
      [
        {text: 'Batal', style: 'cancel'},
        {text: 'Keluar', style: 'destructive', onPress: logout},
      ],
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <View style={[styles.header, {paddingTop: insets.top + Spacing.lg}]}>
        <Text style={styles.headerLabel}>Profil Petugas</Text>
        <View style={styles.avatar}>
          <Icon name={'account'} size={52} color={Colors.brand.deepGreen} />
        </View>
        <Text style={styles.userName}>{user?.full_name || 'Petugas'}</Text>
        <Text style={styles.userRole}>{role}</Text>
        <StatusBadge
          status={user?.is_active === false ? 'error' : 'success'}
          label={user?.is_active === false ? 'Tidak Aktif' : 'Aktif'}
        />
      </View>

      <Text style={styles.sectionTitle}>Informasi akun</Text>
      <AppCard variant={'elevated'} style={styles.infoCard}>
        <InfoRow
          icon={'account-outline'}
          label={'Nama lengkap'}
          value={user?.full_name || 'Belum tersedia'}
        />
        <InfoRow
          icon={'phone-outline'}
          label={'Nomor handphone'}
          value={user?.phone || 'Belum tersedia'}
        />
        <InfoRow
          icon={'badge-account-outline'}
          label={'Peran akun'}
          value={role}
          last
        />
      </AppCard>

      <View style={styles.securityNotice}>
        <Icon name={'shield-check-outline'} size={22} color={Colors.brand.deepGreen} />
        <Text style={styles.securityText}>
          Akun ini digunakan untuk mencatat penjemputan. Jangan berikan akses kepada orang lain.
        </Text>
      </View>

      <View style={styles.logoutWrapper}>
        <AppButton
          label={'Keluar dari Akun'}
          icon={'logout'}
          variant={'outline'}
          onPress={handleLogout}
          fullWidth
        />
      </View>

      <View style={styles.versionRow}>
        <Icon name={'information-outline'} size={17} color={Colors.text.muted} />
        <Text style={styles.versionText}>Lazisnu Collector • Versi 1.0.0</Text>
      </View>
    </ScrollView>
  );
};

const InfoRow = ({
  icon,
  label,
  value,
  last = false,
}: {
  icon: string;
  label: string;
  value: string;
  last?: boolean;
}) => (
  <View style={[styles.infoRow, last && styles.infoRowLast]}>
    <View style={styles.infoIcon}>
      <Icon name={icon} size={22} color={Colors.brand.deepGreen} />
    </View>
    <View style={styles.infoContent}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: Colors.surface.page},
  content: {paddingBottom: Spacing.xl},
  header: {
    alignItems: 'center',
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Spacing.xl,
    backgroundColor: Colors.brand.deepGreen,
    borderBottomLeftRadius: Radius.panel,
    borderBottomRightRadius: Radius.panel,
    ...Shadows.soft,
  },
  headerLabel: {
    ...Typography.heading2,
    color: Colors.text.white,
    alignSelf: 'flex-start',
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface.avatar,
    borderWidth: 2,
    borderColor: Colors.text.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  userName: {...Typography.heading2, color: Colors.text.white, marginBottom: 3},
  userRole: {
    ...Typography.bodySmall,
    color: Colors.text.white,
    opacity: 0.78,
    marginBottom: Spacing.sm,
  },
  sectionTitle: {
    ...Typography.heading3,
    color: Colors.brand.deepGreen,
    marginHorizontal: Layout.screenPadding,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  infoCard: {marginHorizontal: Layout.screenPadding, padding: 0},
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.warm,
  },
  infoRowLast: {borderBottomWidth: 0},
  infoIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.successSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  infoContent: {flex: 1},
  infoLabel: {...Typography.caption, color: Colors.text.secondary, marginBottom: 2},
  infoValue: {...Typography.body, color: Colors.text.primary, fontWeight: '600'},
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.brand.mutedSand,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginHorizontal: Layout.screenPadding,
    marginTop: Spacing.md,
  },
  securityText: {
    flex: 1,
    ...Typography.bodySmall,
    color: Colors.brand.deepGreen,
    lineHeight: 20,
    marginLeft: Spacing.sm,
  },
  logoutWrapper: {marginHorizontal: Layout.screenPadding, marginTop: Spacing.lg},
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xl,
  },
  versionText: {...Typography.caption, color: Colors.text.muted},
});

export default ProfileScreen;
