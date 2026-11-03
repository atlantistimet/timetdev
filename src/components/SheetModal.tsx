import { useEffect, useState, type ReactNode } from 'react';
import { Modal, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useTheme } from '@/theme';

/**
 * Finestra dal basso: lo sfondo scuro sfuma (non scorre), il foglio sale con una molla morbida e scende veloce.
 * Dentro vanno, come prima, un'area che chiude al tocco (trasparente) e il foglio in basso.
 */
export function SheetModal({ visible, onRequestClose, children }: { visible: boolean; onRequestClose: () => void; children: ReactNode }) {
  const theme = useTheme();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(0);
  if (visible && !mounted) setMounted(true);
  // durante la chiusura resta il contenuto di prima, così il foglio non si svuota mentre scende
  const [snap, setSnap] = useState<ReactNode>(children);
  if (visible && snap !== children) setSnap(children);

  useEffect(() => {
    if (visible) {
      progress.set(withSpring(1, { damping: 26, stiffness: 260, mass: 0.9 }));
    } else {
      progress.set(
        withTiming(0, { duration: 220, easing: Easing.in(Easing.cubic) }, (finished) => {
          'worklet';
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
    }
  }, [visible, progress]);

  const scrim = useAnimatedStyle(() => ({ opacity: Math.min(Math.max(progress.get(), 0), 1) }));
  const slide = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - progress.get()) * height }] }));

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onRequestClose}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim }, scrim]} />
      <Animated.View style={[StyleSheet.absoluteFill, slide]} pointerEvents="box-none">
        {visible ? children : snap}
      </Animated.View>
    </Modal>
  );
}
