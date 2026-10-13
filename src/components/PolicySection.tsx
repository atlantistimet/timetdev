import { useTranslation } from 'react-i18next';
import { TierEditor, toRows, type TierRow } from '@/components/TierEditor';
import { TierLines } from '@/components/TierLines';
import { Body, Button, Checkbox, Spacer } from '@/components/ui';
import { STANDARD_TIERS, type CancelPolicy, type Tier } from '@/lib/cancel-policy';

/**
 * Sezione "Policy" di servizi e offerte: o si usa quella ereditata (`inheritedName` / `inheritedTiers`),
 * oppure si modificano le fasce sul posto partendo da un modello.
 */
export function PolicySection({
  inheritedLabel,
  inheritedTiers,
  policies,
  custom,
  onCustomChange,
  rows,
  onRowsChange,
}: {
  inheritedLabel: string;
  inheritedTiers: Tier[];
  policies: CancelPolicy[];
  custom: boolean;
  onCustomChange: (custom: boolean) => void;
  rows: TierRow[];
  onRowsChange: (rows: TierRow[]) => void;
}) {
  const { t } = useTranslation();
  const presets: { key: string; name: string; tiers: Tier[] }[] = [
    ...policies.map((p) => ({ key: p.id, name: p.name, tiers: p.tiers })),
    { key: 'standard', name: t('policy.standardName'), tiers: STANDARD_TIERS },
  ];
  return (
    <>
      <Checkbox label={inheritedLabel} checked={!custom} onChange={() => onCustomChange(false)} />
      <Checkbox label={t('myServices.policyCustomLabel')} checked={custom} onChange={() => onCustomChange(true)} />
      <Spacer size={4} />
      {custom ? (
        <>
          <Body muted>{t('policy.editHelp')}</Body>
          <Spacer size={8} />
          <Body>{t('myServices.startFrom')}</Body>
          {presets.map((preset) => (
            <Button key={preset.key} title={preset.name} variant="ghost" onPress={() => onRowsChange(toRows(preset.tiers))} />
          ))}
          <Spacer size={8} />
          <TierEditor rows={rows} onChange={onRowsChange} />
        </>
      ) : (
        <TierLines tiers={inheritedTiers} />
      )}
    </>
  );
}
