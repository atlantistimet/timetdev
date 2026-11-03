// Quando dal Nuovo post si apre "Crea nuovo servizio / offerta / slot", qui si ricorda cosa esisteva già:
// tornando al post, la cosa nuova si collega da sola.
type Pending = { kind: 'service' | 'offer' | 'slot'; before: Set<string> };
let pending: Pending | null = null;

export const rememberCreating = (kind: Pending['kind'], existingIds: string[]) => {
  pending = { kind, before: new Set(existingIds) };
};
export const takeCreating = (): Pending | null => {
  const p = pending;
  pending = null;
  return p;
};
