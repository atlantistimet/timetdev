// Commissioni Timeet su una prenotazione (importi in centesimi). Unica fonte di verità lato server.
//  - da 15 € in su: cliente 1 € fisso; venditore 1 € + 5%
//  - sotto i 15 €: cliente 5%; venditore 5%
//  - venditore Pro: solo il 5% (niente quota fissa)
// La base di calcolo è prezzo del servizio + eventuale extra (trasferta/spazio).
export const FIXED_FEE_CENTS = 100;
export const FIXED_FEE_THRESHOLD_CENTS = 1500;
export const PERCENT_FEE = 0.05;

export type Fees = { clientFeeCents: number; sellerFeeCents: number; applicationFeeCents: number; totalChargeCents: number };

export function bookingFees(baseCents: number, isPro: boolean): Fees {
  const percent = Math.round(baseCents * PERCENT_FEE);
  const fixedApplies = baseCents >= FIXED_FEE_THRESHOLD_CENTS;
  const clientFeeCents = fixedApplies ? FIXED_FEE_CENTS : percent;
  const sellerFeeCents = isPro ? percent : fixedApplies ? FIXED_FEE_CENTS + percent : percent;
  return {
    clientFeeCents,
    sellerFeeCents,
    applicationFeeCents: clientFeeCents + sellerFeeCents,
    totalChargeCents: baseCents + clientFeeCents,
  };
}
