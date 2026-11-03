import { makeMutable, withTiming, Easing } from 'react-native-reanimated';

/** 0 = barra in basso normale, 1 = rimpicciolita (si scorre verso il basso). */
export const barCompact = makeMutable(0);

let lastY = 0;
let target = 0;
const move = (to: number) => {
  if (to === target) return;
  target = to;
  barCompact.set(withTiming(to, { duration: 240, easing: Easing.bezier(0.22, 1, 0.36, 1) }));
};

/** Da chiamare mentre una schermata scorre: giù = barra piccola, su o in cima = barra normale. */
export function reportScroll(y: number): void {
  if (y < 24) move(0);
  else if (y - lastY > 8) move(1);
  else if (lastY - y > 8) move(0);
  if (Math.abs(y - lastY) > 8 || y < 24) lastY = y;
}

/** Al cambio di schermata la barra torna normale. */
export function resetBar(): void {
  lastY = 0;
  move(0);
}
