import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useAuthStore, useTasksStore, useUpdateStore} from '../stores';
import {getBiometryType, isBiometricAvailable} from '../services/biometric';
import {c1Service, type BranchSubmissionRowDto} from '../services/api';
import {isManager, normalizeRole} from '../roles/roleMap';
import {APP_VERSION} from '../config/appConfig';
import {AppButton, AppCard, StatusBadge} from '../components/ui';
import {Colors, Layout, Radius, Shadows, Spacing, Typography} from '../theme';
import {formatCurrency} from '../utils/format';
import {getErrorMessage} from '../utils/error';
import {getInitials} from '../utils';

const roleLabels: Record<string, string> = {
  PETUGAS: 'Petugas Penjemputan',
  STAF_PENGUMPULAN: 'Staf Pengumpulan',
  STAF_KEUANGAN: 'Bendahara (Keuangan)',
  ADMIN_RANTING: 'Admin Ranting',
  ADMIN_KECAMATAN: 'Admin Kecamatan',
};

const ProfileScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const {
    user,
    logout,
    biometricEnabled,
    enableBiometric: enableBio,
    disableBiometric: disableBio,
  } = useAuthStore();
  const role = user?.role ? roleLabels[user.role] || user.role : 'Petugas';
  const [biometryType, setBiometryType] = useState<string | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [advancedVisible, setAdvancedVisible] = useState(false);

  // Berita Acara (halaman Profil). Hanya manager: daftarnya bersumber dari
  // `GET /admin/branch-submissions`, yang bergerbang ADMIN_RANTING /
  // ADMIN_KECAMATAN. Bendahara (STAF_KEUANGAN) belum punya endpoint daftar
  // sendiri — inbox keuangannya adalah antrean pekerjaan, bukan arsip, jadi
  // bagian ini tidak ditampilkan untuknya.
  const canManageBa = isManager(normalizeRole(user?.role));
  const [baRows, setBaRows] = useState<BranchSubmissionRowDto[]>([]);
  const [baLoading, setBaLoading] = useState(false);
  const [baError, setBaError] = useState<string | null>(null);
  const [baBusyId, setBaBusyId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const available = await isBiometricAvailable();
      if (!isMounted) {
        return;
      }
      setBiometricAvailable(available);
      if (available) {
        const type = await getBiometryType();
        if (!isMounted) {
          return;
        }
        setBiometryType(type);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggleBiometric = async (value: boolean) => {
    if (value) {
      const success = await enableBio();
      if (!success) {
        Alert.alert(
          'Biometrik Tidak Tersedia',
          'Perangkat ini tidak mendukung biometrik atau terjadi kesalahan.',
        );
      }
    } else {
      await disableBio();
    }
  };

  const handleLogout = () => {
    Alert.alert('Konfirmasi Keluar', 'Apakah Anda yakin ingin keluar dari aplikasi?', [
      {text: 'Batal', style: 'cancel'},
      {text: 'Keluar', style: 'destructive', onPress: logout},
    ]);
  };

  const checkManually = useUpdateStore(state => state.checkManually);

  const handleCheckUpdates = useCallback(async () => {
    try {
      const result = await checkManually();
      if (result === 'up-to-date') {
        Alert.alert('Versi Terbaru', `Kamu sudah memakai versi terbaru (${APP_VERSION}).`);
      }
    } catch (error) {
      Alert.alert('Gagal Memeriksa', getErrorMessage(error, 'Tidak dapat memeriksa pembaruan'));
    }
  }, [checkManually]);

  const {activeCount, completePeriod} = useTasksStore();

  const handleCompletePeriod = useCallback(() => {
    if (!activeCount) {
      return;
    }
    Alert.alert(
      'Selesai Periode',
      `Anda memiliki ${activeCount} kaleng yang belum dijemput. Tandai semua sebagai selesai dan lanjut ke periode berikutnya?`,
      [
        {text: 'Batal', style: 'cancel'},
        {
          text: 'Ya, Selesaikan',
          onPress: async () => {
            const result = await completePeriod();
            if (result.error) {
              Alert.alert('Gagal', result.error);
            } else if (result.skipped + result.expiredClosed > 0) {
              Alert.alert(
                'Berhasil',
                result.expiredClosed > 0
                  ? `${result.skipped} kaleng periode berjalan + ${result.expiredClosed} kaleng kedaluwarsa ditandai tidak dijemput.`
                  : `${result.skipped} kaleng ditandai tidak dijemput. Periode berjalan selesai.`,
              );
            }
          },
        },
      ],
    );
  }, [activeCount, completePeriod]);

  /** BA sah = sudah kedua tanda tangan; di luar itu server menolak terbitkan. */
  const baIsFinal = (status: string): boolean => status === 'FINAL' || status === 'FINAL_NOL';

  const loadBa = useCallback(async () => {
    if (!canManageBa) {
      return;
    }
    setBaLoading(true);
    setBaError(null);
    try {
      /* Periode SENGAJA tidak dikirim: server memakai periode berjalan, dan
         itulah sumber kebenaran yang sama dipakai penjaga-fresh
         (`periodComplete`). Mengirim year/month dari jam HP akan memisahkan
         keduanya di batas bulan — HP di WIB, server kemungkinan UTC — sehingga
         daftar bisa menunjuk periode yang berbeda dari yang dijaga server.
         Konsekuensi yang diterima: saat rollover bulan daftar ini menampilkan
         periode baru (bisa kosong). Itu bukan data hilang — arsip tetap ada di
         periode masing-masing, dan server yang menentukan periode mana. */
      const res = await c1Service.getBranchSubmissions();
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Gagal memuat daftar berita acara');
      }
      setBaRows(res.data);
    } catch (error) {
      setBaError(getErrorMessage(error, 'Gagal memuat daftar berita acara'));
    } finally {
      setBaLoading(false);
    }
  }, [canManageBa]);

  useEffect(() => {
    loadBa();
  }, [loadBa]);

  const handleGenerateBa = useCallback(
    async (row: BranchSubmissionRowDto) => {
      setBaBusyId(row.id);
      try {
        const res = await c1Service.generateBranchBaPdf(row.id);
        if (!res.success) {
          throw new Error(res.error?.message || 'Gagal menerbitkan PDF');
        }
        // Muat ulang daftar: `pdf_url` baru terisi setelah server menyimpan
        // berkas, dan itulah penanda yang memunculkan tombol Unduh.
        await loadBa();
        Alert.alert('PDF Siap', `Berita acara ${row.period} sudah diterbitkan.`);
      } catch (error) {
        Alert.alert('Gagal Menerbitkan', getErrorMessage(error, 'Tidak dapat menerbitkan PDF'));
      } finally {
        setBaBusyId(null);
      }
    },
    [loadBa],
  );

  const handleDownloadBa = useCallback(async (row: BranchSubmissionRowDto) => {
    setBaBusyId(row.id);
    try {
      // Tautan diambil tepat sebelum dibuka — umurnya hanya 600 detik.
      const res = await c1Service.getBranchBaPdf(row.id);
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Gagal menyiapkan unduhan');
      }
      // Sengaja TANPA `Linking.canOpenURL`: di Android 11+ ia mengembalikan
      // false untuk https bila `<queries>` tak dideklarasikan di manifes,
      // sehingga unduhan yang sebenarnya bisa dilaporkan "tidak ada aplikasi".
      await Linking.openURL(res.data.download_url);
    } catch (error) {
      Alert.alert('Gagal Mengunduh', getErrorMessage(error, 'Tidak dapat mengunduh PDF'));
    } finally {
      setBaBusyId(null);
    }
  }, []);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <LinearGradient
        colors={[Colors.brand.heroStart, Colors.brand.deepGreen, Colors.brand.heroEnd]}
        style={[styles.header, {paddingTop: insets.top + Spacing.lg}]}>
        <Text style={styles.headerLabel}>Profil Petugas</Text>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(user?.full_name)}</Text>
        </View>
        <Text style={styles.userName}>{user?.full_name || 'Petugas'}</Text>
        <Text style={styles.userRole}>{role}</Text>
        <StatusBadge
          status={user?.is_active === false ? 'error' : 'success'}
          label={user?.is_active === false ? 'Tidak Aktif' : 'Aktif'}
        />
      </LinearGradient>

      <Text style={[styles.sectionTitle, styles.sectionTitleFirst]}>Informasi akun</Text>
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
        <InfoRow icon={'badge-account-outline'} label={'Peran akun'} value={role} last />
      </AppCard>

      {canManageBa && (
        <>
          <Text style={styles.sectionTitle}>Berita Acara</Text>
          <AppCard variant={'elevated'} style={styles.infoCard}>
            {baLoading && baRows.length === 0 ? (
              <View style={styles.baStateRow}>
                <ActivityIndicator />
              </View>
            ) : null}
            {baError ? <Text style={styles.baError}>{baError}</Text> : null}
            {!baLoading && !baError && baRows.length === 0 ? (
              <Text style={styles.baStateRow}>Belum ada setoran ranting pada periode berjalan.</Text>
            ) : null}
            {baRows.map((row, index) => (
              <View
                key={row.id}
                style={[styles.baRow, index === baRows.length - 1 && styles.infoRowLast]}>
                <Text style={styles.baBranch} numberOfLines={1}>
                  {row.branch_name || row.period}
                </Text>
                <View style={styles.baHead}>
                  <Text style={styles.baMeta}>
                    {row.period} • {formatCurrency(row.total_amount)}
                  </Text>
                  <StatusBadge
                    status={baIsFinal(row.status) ? 'success' : 'pending'}
                    label={baIsFinal(row.status) ? 'Sudah diterbitkan' : 'Belum diterbitkan'}
                  />
                </View>
                {row.ba_number ? <Text style={styles.baMeta}>Nomor {row.ba_number}</Text> : null}
                {!baIsFinal(row.status) ? (
                  <Text style={styles.baWarn}>
                    Belum sah — masih menunggu kedua tanda tangan, jadi belum bisa diterbitkan.
                  </Text>
                ) : (
                  <View style={styles.baActions}>
                    <AppButton
                      label={baBusyId === row.id ? 'Memproses…' : 'Generate PDF'}
                      onPress={() => handleGenerateBa(row)}
                      disabled={baBusyId !== null}
                      loading={baBusyId === row.id}
                    />
                    {/* Muncul hanya setelah server benar-benar menyimpan berkas
                        (`pdf_url` terisi) — itulah "proses selesai" yang diminta. */}
                    {row.pdf_url ? (
                      <AppButton
                        label={'Unduh PDF'}
                        icon={'download'}
                        variant={'outline'}
                        onPress={() => handleDownloadBa(row)}
                        disabled={baBusyId !== null}
                      />
                    ) : null}
                  </View>
                )}
              </View>
            ))}
          </AppCard>
        </>
      )}

      {biometricAvailable && (
        <>
          <Text style={styles.sectionTitle}>Keamanan Biometrik</Text>
          <AppCard variant={'elevated'} style={styles.infoCard}>
            <View style={styles.biometricRow}>
              <View style={styles.biometricLeft}>
                <Icon name={'fingerprint'} size={22} color={Colors.brand.deepGreen} />
                <View style={styles.biometricText}>
                  <Text style={styles.biometricLabel}>{biometryType || 'Login Biometrik'}</Text>
                  <Text style={styles.biometricStatus}>
                    {biometricEnabled ? 'Aktif' : 'Tidak Aktif'}
                  </Text>
                </View>
              </View>
              <Switch
                value={biometricEnabled}
                onValueChange={handleToggleBiometric}
                trackColor={{
                  false: Colors.border.warm,
                  true: Colors.brand.deepGreen,
                }}
                thumbColor={Colors.text.white}
              />
            </View>
          </AppCard>
        </>
      )}

      <View style={styles.securityNotice}>
        <Icon name={'shield-check-outline'} size={22} color={Colors.brand.deepGreen} />
        <Text style={styles.securityText}>
          Akun ini digunakan untuk mencatat penjemputan. Jangan berikan akses kepada orang lain.
        </Text>
      </View>

      {/* Gerbang aman: aksi sensitif tersembunyi di balik "Danger Area" agar
          tidak tertekan tidak sengaja (keputusan PO, RENCANA-UI-POLISH §2.E). */}
      <TouchableOpacity
        accessibilityRole={'button'}
        accessibilityLabel={
          advancedVisible ? 'Tutup bagian Danger Area' : 'Buka bagian Danger Area'
        }
        onPress={() => setAdvancedVisible(v => !v)}
        style={styles.advancedToggle}>
        <Icon
          name={advancedVisible ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.text.muted}
        />
        <Text style={styles.advancedText}>Danger Area</Text>
      </TouchableOpacity>

      {advancedVisible && (
        <>
          <View style={styles.completePeriodWrapper}>
            <TouchableOpacity
              accessibilityRole={'button'}
              accessibilityLabel={
                activeCount
                  ? `Selesaikan periode berjalan, ${activeCount} kaleng belum dijemput`
                  : 'Tidak ada kaleng yang belum dijemput'
              }
              disabled={!activeCount}
              onPress={handleCompletePeriod}
              style={[styles.completePeriodButton, !activeCount && styles.completePeriodDisabled]}>
              <Icon
                name={'flag-checkered'}
                size={18}
                color={activeCount ? Colors.status.error : Colors.text.muted}
              />
              <Text
                style={[
                  styles.completePeriodText,
                  !activeCount && styles.completePeriodTextDisabled,
                ]}>
                {activeCount ? `Selesai Periode (${activeCount} belum)` : 'Selesai Periode'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.logoutWrapper}>
            <AppButton
              label={'Keluar dari Akun'}
              icon={'logout'}
              variant={'dangerOutline'}
              onPress={handleLogout}
              fullWidth
            />
          </View>
        </>
      )}

      <TouchableOpacity style={styles.versionRow} onPress={handleCheckUpdates}>
        <Icon name={'information-outline'} size={17} color={Colors.text.muted} />
        <Text style={styles.versionText}>Lazisnu Collector • Versi {APP_VERSION}</Text>
        <Text style={styles.checkUpdateText}>Periksa Pembaruan</Text>
      </TouchableOpacity>
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
    borderBottomLeftRadius: Radius.hero,
    borderBottomRightRadius: Radius.hero,
    ...Shadows.soft,
  },
  avatarText: {
    color: Colors.brand.deepGreen,
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 1,
  },
  headerLabel: {
    ...Typography.heading1,
    color: Colors.text.white,
    fontSize: 23,
    lineHeight: 29,
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
  sectionTitleFirst: {marginTop: Spacing.md},
  infoCard: {
    marginHorizontal: Layout.screenPadding,
    padding: 0,
    borderWidth: 1,
    borderColor: Colors.border.warm,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.warm,
  },
  infoRowLast: {borderBottomWidth: 0},
  baStateRow: {padding: Spacing.md},
  baError: {...Typography.body, color: Colors.status.error, padding: Spacing.md},
  baRow: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border.warm,
  },
  baBranch: {...Typography.body, color: Colors.text.primary, fontWeight: '700'},
  baHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: 2,
  },
  baMeta: {...Typography.caption, color: Colors.text.secondary, flex: 1},
  baWarn: {...Typography.caption, color: Colors.status.warning, marginTop: Spacing.xs},
  baActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
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
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: Layout.screenPadding,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  advancedText: {...Typography.body, color: Colors.text.muted},
  completePeriodWrapper: {marginHorizontal: Layout.screenPadding, marginTop: Spacing.sm},
  completePeriodButton: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.xs + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.status.error + '60',
    backgroundColor: Colors.surface.errorSoft,
  },
  completePeriodDisabled: {
    borderColor: Colors.border.warm,
    backgroundColor: Colors.surface.card,
    opacity: 0.6,
  },
  completePeriodText: {
    ...Typography.label,
    color: Colors.status.error,
  },
  completePeriodTextDisabled: {
    color: Colors.text.muted,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xl,
  },
  versionText: {...Typography.caption, color: Colors.text.muted},
  checkUpdateText: {
    ...Typography.caption,
    color: Colors.brand.emerald,
    fontWeight: '700',
    marginLeft: 'auto',
  },
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Spacing.md,
  },
  biometricLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  biometricText: {
    flexDirection: 'column',
  },
  biometricLabel: {
    ...Typography.body,
    color: Colors.text.primary,
    fontWeight: '600',
  },
  biometricStatus: {
    ...Typography.caption,
    color: Colors.text.secondary,
  },
});

export default ProfileScreen;
