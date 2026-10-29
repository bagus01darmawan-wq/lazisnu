import {useMemo, useRef} from 'react';
import {Gesture} from 'react-native-gesture-handler';

/** Jarak minimum (px) geseran yang dianggap sengaja bila tanpa laju. */
export const SWIPE_SWITCH_DISTANCE = 56;
/** Laju minimum (px/s) untuk "flick" — geseran pendek tetap dianggap sengaja. */
export const SWIPE_SWITCH_VELOCITY = 400;

/**
 * Murni, tanpa efek samping. Mengembalikan arah pindah tab dari satu gestur pan:
 *  -1 = ke tab sebelumnya (jari ke kanan),
 *   1 = ke tab berikutnya (jari ke kiri),
 *   0 = abaikan (terlalu pendek dan terlalu lambat).
 * Dominasi arah horizontal (vs scroll vertikal) ditangani failOffsetY/
 * activeOffsetX pada gestur, bukan di sini.
 *
 * Bertanda 'worklet' supaya tetap bisa dipanggil bila callback gestur
 * dijalankan di UI runtime; tanpa itu pemanggilan lintas modul gagal dengan
 * "[Worklets] Tried to synchronously call a Remote Function".
 */
export function decideTabSwipe(translationX: number, velocityX: number): -1 | 0 | 1 {
  'worklet';
  const deliberate =
    Math.abs(translationX) >= SWIPE_SWITCH_DISTANCE || Math.abs(velocityX) >= SWIPE_SWITCH_VELOCITY;
  if (!deliberate) {
    return 0;
  }
  return translationX < 0 ? 1 : -1;
}

interface TabSwipeOptions {
  onPrevious: () => void;
  onNext: () => void;
  enabled?: boolean;
}

/**
 * Gestur geser-samping untuk berpindah filter tab (layar Tugas & Riwayat).
 * Kembalikan ke <GestureDetector>; gestur hanya aktif pada gerak horizontal
 * yang jelas sehingga scroll vertikal daftar dan pull-to-refresh tidak
 * terganggu. Ketuk SegmentedControl tetap berfungsi seperti biasa.
 *
 * `.runOnJS(true)` dipakai supaya callback berjalan langsung di thread JS:
 * tidak perlu worklet maupun `runOnJS` dari reanimated, jadi tidak ada nilai
 * React (ref) yang harus diserialisasi ke UI thread saat gestur berakhir.
 */
export function useTabSwipeSwitch({onPrevious, onNext, enabled = true}: TabSwipeOptions) {
  // Callback disimpan di ref supaya gestur tidak dibuat ulang tiap render
  // (layar ini sering re-render: ketik pencarian, loading, dsb).
  const handlersRef = useRef({onPrevious, onNext});
  handlersRef.current = {onPrevious, onNext};

  return useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .activeOffsetX([-24, 24])
        .failOffsetY([-16, 16])
        .enabled(enabled)
        .onEnd(event => {
          const direction = decideTabSwipe(event.translationX, event.velocityX);
          if (direction === 1) {
            handlersRef.current.onNext();
          } else if (direction === -1) {
            handlersRef.current.onPrevious();
          }
        }),
    [enabled],
  );
}
