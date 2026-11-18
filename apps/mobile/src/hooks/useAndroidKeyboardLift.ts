import {useEffect, useState} from 'react';
import {Keyboard, Platform} from 'react-native';

/**
 * Android edge-to-edge (RN 0.88, targetSdk 36): jendela Modal tidak ikut
 * menyusut saat keyboard muncul (bukan hanya Modal yang tidak adjustResize —
 * perilaku ini berlaku per jendela). Kembalikan tinggi keyboard agar bisa
 * dipakai sebagai `paddingBottom` overlay sheet; sheet tetap terangkat di
 * atas keyboard. Selalu 0 di iOS — di sana KeyboardAvoidingView
 * (`behavior="padding"`) yang menangani.
 */
export function useAndroidKeyboardLift() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    const show = Keyboard.addListener('keyboardDidShow', event =>
      setKeyboardHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return keyboardHeight;
}
