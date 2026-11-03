import { forwardRef } from 'react';
import { Pressable as RNPressable, type GestureResponderEvent, type PressableProps, type StyleProp, type View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

type Haptic = 'light' | 'medium' | 'select';
type Props = Omit<PressableProps, 'style'> & {
  style?: PressableProps['style'];
  /** Quanto si rimpicciolisce al tocco (1 = per niente). */
  scaleTo?: number;
  /** Vibrazione leggera al tocco; senza la libreria nativa (prima della nuova build) non fa nulla. */
  haptic?: Haptic;
};

type HapticsModule = {
  impactAsync: (style: unknown) => Promise<void>;
  selectionAsync: () => Promise<void>;
  ImpactFeedbackStyle: { Light: unknown; Medium: unknown };
};
let hapticsModule: HapticsModule | null | undefined;
function loadHaptics(): HapticsModule | null {
  if (hapticsModule === undefined) {
    try {
      // caricata solo se serve: se la build non la contiene, niente errori
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      hapticsModule = require('expo-haptics') as HapticsModule;
    } catch {
      hapticsModule = null;
    }
  }
  return hapticsModule;
}

/** Vibrazione leggera, usabile anche fuori dai bottoni (es. like riuscito). */
export function buzz(kind: Haptic = 'light'): void {
  const h = loadHaptics();
  if (!h) return;
  try {
    void (kind === 'select' ? h.selectionAsync() : h.impactAsync(kind === 'medium' ? h.ImpactFeedbackStyle.Medium : h.ImpactFeedbackStyle.Light)).catch(() => {});
  } catch {
    // niente vibrazione: pazienza
  }
}

/** Come Pressable, ma al tocco si rimpicciolisce un poco e torna con una molla. Stessa API di quello di React Native. */
export const Pressable = forwardRef<View, Props>(function Pressable({ style, scaleTo = 0.96, haptic, onPressIn, onPressOut, onPress, ...rest }, ref) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const resolved: StyleProp<ViewStyle> = typeof style === 'function' ? style({ pressed: false }) : style;
  return (
    <AnimatedPressable
      ref={ref}
      {...rest}
      onPressIn={(e: GestureResponderEvent) => {
        scale.value = withTiming(scaleTo, { duration: 110, easing: Easing.out(Easing.quad) });
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        scale.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.cubic) });
        onPressOut?.(e);
      }}
      onPress={(e: GestureResponderEvent) => {
        if (haptic) buzz(haptic);
        onPress?.(e);
      }}
      style={[resolved, animated]}
    />
  );
});
