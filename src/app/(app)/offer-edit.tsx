import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TierEditor, fromRows, rowsIncomplete, toRows, type TierRow } from '@/components/TierEditor';
import { TierLines } from '@/components/TierLines';
import { Body, Button, Checkbox, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listPolicies, STANDARD_TIERS, validateTiers, type CancelPolicy, type Tier } from '@/lib/cancel-policy';
import { centsToEuroText, loadMyService, MIN_PRICE_CENTS, parseEuroToCents, saveService } from '@/lib/offers';

export default function OfferEditScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [ready, setReady] = useState(false);
  const [policies, setPolicies] = useState<CancelPolicy[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [duration, setDuration] = useState('');
  const [active, setActive] = useState(true);
  const [custom, setCustom] = useState(false); // false = vale la policy predefinita del venditore
  const [rows, setRows] = useState<TierRow[]>(toRows(STANDARD_TIERS));
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    (async () => {
      const [list, service] = await Promise.all([listPolicies(userId), id ? loadMyService(id) : Promise.resolve(null)]);
      if (!alive) return;
      setPolicies(list.policies);
      const base = list.policies.find((p) => p.is_default)?.tiers ?? STANDARD_TIERS;
      setRows(toRows(service?.cancel_tiers ?? base));
      if (service) {
        setTitle(service.title);
        setDescription(service.description ?? '');
        setPrice(centsToEuroText(service.price_cents));
        setDuration(String(service.duration_min));
        setActive(service.active);
        setCustom(service.cancel_tiers !== null);
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId, id]);

  if (!ready) return <LoadingView />;

  const defaultPolicy = policies.find((p) => p.is_default) ?? null;
  const defaultTiers: Tier[] = defaultPolicy?.tiers ?? STANDARD_TIERS;
  // modelli da cui partire: le policy salvate e la standard Timeet
  const presets: { key: string; name: string; tiers: Tier[] }[] = [
    ...policies.map((p) => ({ key: p.id, name: p.name, tiers: p.tiers })),
    { key: 'standard', name: t('policy.standardName'), tiers: STANDARD_TIERS },
  ];

  const save = async () => {
    if (!userId) return;
    const priceCents = parseEuroToCents(price);
    const durationMin = Number(duration);
    if (!title.trim()) return setErrorKey('offers.errors.title');
    if (priceCents === null || priceCents < MIN_PRICE_CENTS) return setErrorKey('offers.errors.price');
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) return setErrorKey('offers.errors.duration');
    let cancelTiers: Tier[] | null = null;
    if (custom) {
      if (rowsIncomplete(rows)) return setErrorKey('policy.errors.empty');
      cancelTiers = fromRows(rows);
      const invalid = validateTiers(cancelTiers);
      if (invalid) return setErrorKey(invalid);
    }
    setSaving(true);
    setErrorKey(null);
    const failure = await saveService({ id: id ?? null, sellerId: userId, title, description, priceCents, durationMin, active, cancelTiers });
    setSaving(false);
    if (failure) setErrorKey(failure);
    else router.replace('/offers');
  };

  return (
    <Screen>
      <Title>{t(id ? 'offers.editTitle' : 'offers.newTitle')}</Title>
      <Spacer />
      <TextField label={t('offers.fieldTitle')} value={title} onChangeText={setTitle} maxLength={80} />
      <TextField label={t('offers.fieldDescription')} value={description} onChangeText={setDescription} multiline maxLength={500} />
      <TextField label={t('offers.fieldPrice')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint={t('offers.priceHint')} />
      <TextField label={t('offers.fieldDuration')} value={duration} onChangeText={(v) => setDuration(v.replace(/\D/g, ''))} keyboardType="number-pad" />
      <Checkbox label={t('offers.activeLabel')} checked={active} onChange={setActive} />

      <Spacer />
      <Title>{t('offers.policySection')}</Title>
      <Body muted>{t('offers.policyHelp')}</Body>
      <Spacer size={8} />
      <Checkbox
        label={defaultPolicy ? t('offers.policyDefaultNamed', { name: defaultPolicy.name }) : t('offers.policyDefaultStandard')}
        checked={!custom}
        onChange={() => setCustom(false)}
      />
      <Checkbox label={t('offers.policyCustomLabel')} checked={custom} onChange={() => setCustom(true)} />
      <Spacer size={4} />
      {custom ? (
        <>
          <Body muted>{t('policy.editHelp')}</Body>
          <Spacer size={8} />
          <Body>{t('offers.startFrom')}</Body>
          {presets.map((preset) => (
            <Button key={preset.key} title={preset.name} variant="ghost" onPress={() => setRows(toRows(preset.tiers))} />
          ))}
          <Spacer size={8} />
          <TierEditor rows={rows} onChange={setRows} />
        </>
      ) : (
        <TierLines tiers={defaultTiers} />
      )}

      <Spacer />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Button title={t('policy.save')} onPress={() => void save()} loading={saving} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/offers')} />
    </Screen>
  );
}
