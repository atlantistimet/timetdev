export type PaymentFormProps = {
  clientSecret: string;
  /** Account Stripe del venditore: il pagamento vive lì (addebito diretto). */
  stripeAccount: string;
  onPaid: () => void;
  /** Pagamento rifiutato (carta, fondi…): la schermata mostra il foglio dedicato. */
  onFailed?: (message: string) => void;
};
