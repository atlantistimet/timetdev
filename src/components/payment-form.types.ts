export type PaymentFormProps = {
  clientSecret: string;
  /** Account Stripe del venditore: il pagamento vive lì (addebito diretto). */
  stripeAccount: string;
  onPaid: () => void;
};
