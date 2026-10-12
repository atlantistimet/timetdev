import { useTranslation } from 'react-i18next';
import { Body } from '@/components/ui';
import { byHoursDesc, type Tier } from '@/lib/cancel-policy';

/** Elenco leggibile delle fasce di rimborso. */
export function TierLines({ tiers }: { tiers: Tier[] }) {
  const { t } = useTranslation();
  const label = (hours: number) =>
    hours >= 24 && hours % 24 === 0 ? t('policy.days', { count: hours / 24 }) : t('policy.hours', { count: hours });
  return (
    <>
      {byHoursDesc(tiers).map((tier) => (
        <Body key={tier.hours_before} muted>
          {tier.hours_before === 0
            ? t('policy.lineLast', { pct: tier.refund_pct })
            : t('policy.line', { when: label(tier.hours_before), pct: tier.refund_pct })}
        </Body>
      ))}
    </>
  );
}
