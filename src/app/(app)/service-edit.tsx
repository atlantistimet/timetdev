import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PolicySection } from '@/components/PolicySection';
import { fromRows, rowsIncomplete, toRows, type TierRow } from '@/components/TierEditor';
import { Body, Button, Checkbox, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listPolicies, STANDARD_TIERS, validateTiers, type CancelPolicy, type Tier } from '@/lib/cancel-policy';
import { centsToEuroText, loadMyService, MIN_PRICE_CENTS, parseEuroToCents, saveService } from '@/lib/my-services';

export default function ServiceEditScreen() {
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

  const save = async () => {
    if (!userId) return;
    const priceCents = parseEuroToCents(price);
    const durationMin = Number(duration);
    if (!title.trim()) return setErrorKey('myServices.errors.title');
    if (priceCents === null || priceCents < MIN_PRICE_CENTS) return setErrorKey('myServices.errors.price');
    if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > 480) return setErrorKey('myServices.errors.duration');
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
    else router.replace('/my-services');
  };

  return (
    <Screen>
      <Title>{t(id ? 'myServices.editTitle' : 'myServices.newTitle')}</Title>
      <Spacer />
      <TextField label={t('myServices.fieldTitle')} value={title} onChangeText={setTitle} maxLength={80} />
      <TextField label={t('myServices.fieldDescription')} value={description} onChangeText={setDescription} multiline maxLength={500} />
      <TextField label={t('myServices.fieldPrice')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint={t('myServices.priceHint')} />
      <TextField label={t('myServices.fieldDuration')} value={duration} onChangeText={(v) => setDuration(v.replace(/\D/g, ''))} keyboardType="number-pad" />
      <Checkbox label={t('myServices.activeLabel')} checked={active} onChange={setActive} />

      <Spacer />
      <Title>{t('myServices.policySection')}</Title>
      <Body muted>{t('myServices.policyHelp')}</Body>
      <Spacer size={8} />
      <PolicySection
        inheritedLabel={defaultPolicy ? t('myServices.policyDefaultNamed', { name: defaultPolicy.name }) : t('myServices.policyDefaultStandard')}
        inheritedTiers={defaultTiers}
        policies={policies}
        custom={custom}
        onCustomChange={setCustom}
        rows={rows}
        onRowsChange={setRows}
      />

      <Spacer />
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Button title={t('policy.save')} onPress={() => void save()} loading={saving} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/my-services')} />
    </Screen>
  );
}
