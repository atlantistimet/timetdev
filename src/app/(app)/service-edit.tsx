import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PhotosSection } from '@/components/PhotosSection';
import { PolicySection } from '@/components/PolicySection';
import { fromRows, rowsIncomplete, toRows, type TierRow } from '@/components/TierEditor';
import { Body, Button, Checkbox, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listPolicies, STANDARD_TIERS, validateTiers, type CancelPolicy, type Tier } from '@/lib/cancel-policy';
import { PLACES, type Place, centsToEuroText, loadMyService, MIN_PRICE_CENTS, parseEuroToCents, saveService } from '@/lib/my-services';

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
  const [isPackage, setIsPackage] = useState(false);
  const [sessionsText, setSessionsText] = useState('');
  const [active, setActive] = useState(true);
  const [places, setPlaces] = useState<Place[]>(['online']);
  const [spaceFee, setSpaceFee] = useState('');
  const [includesText, setIncludesText] = useState('');
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
        setIsPackage(service.kind === 'package');
        setSessionsText(service.sessions ? String(service.sessions) : '');
        setActive(service.active);
        setPlaces(service.places);
        setSpaceFee(service.space_fee_cents ? centsToEuroText(service.space_fee_cents) : '');
        setIncludesText(service.includes.join('\n'));
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
    const sessions = Number(sessionsText);
    if (isPackage && (!Number.isInteger(sessions) || sessions < 2 || sessions > 50)) return setErrorKey('myServices.errors.sessions');
    if (places.length === 0) return setErrorKey('myServices.errors.places');
    const spaceFeeCents = places.includes('sede') && spaceFee.trim() ? parseEuroToCents(spaceFee) : 0;
    if (spaceFeeCents === null) return setErrorKey('myServices.errors.spaceFee');
    const includes = includesText.split('\n').map((x) => x.trim()).filter(Boolean);
    if (includes.length > 8 || includes.some((x) => x.length > 80)) return setErrorKey('myServices.errors.includes');
    let cancelTiers: Tier[] | null = null;
    if (custom) {
      if (rowsIncomplete(rows)) return setErrorKey('policy.errors.empty');
      cancelTiers = fromRows(rows);
      const invalid = validateTiers(cancelTiers);
      if (invalid) return setErrorKey(invalid);
    }
    setSaving(true);
    setErrorKey(null);
    const failure = await saveService({ id: id ?? null, sellerId: userId, title, description, priceCents, durationMin, active, cancelTiers, places, includes, spaceFeeCents, kind: isPackage ? 'package' : 'slot', sessions: isPackage ? sessions : null });
    setSaving(false);
    if (failure) setErrorKey(failure);
    else router.replace('/my-services');
  };

  return (
    <Screen>
      <Title>{t(id ? 'myServices.editTitle' : 'myServices.newTitle')}</Title>
      <Spacer />
      {!id ? (
        <ChipRow>
          <Chip label={t('myServices.kindSingle')} selected={!isPackage} onPress={() => setIsPackage(false)} />
          <Chip label={t('myServices.kindPackage')} selected={isPackage} onPress={() => setIsPackage(true)} />
        </ChipRow>
      ) : null}
      <TextField label={t('myServices.fieldTitle')} value={title} onChangeText={setTitle} maxLength={80} />
      <TextField label={t('myServices.fieldDescription')} value={description} onChangeText={setDescription} multiline maxLength={500} />
      {isPackage ? <TextField label={t('myServices.fieldSessions')} value={sessionsText} onChangeText={(v) => setSessionsText(v.replace(/\D/g, ''))} keyboardType="number-pad" hint={t('myServices.sessionsHint')} /> : null}
      <TextField label={t(isPackage ? 'myServices.fieldPackagePrice' : 'myServices.fieldPrice')} value={price} onChangeText={setPrice} keyboardType="decimal-pad" hint={t(isPackage ? 'myServices.packagePriceHint' : 'myServices.priceHint')} />
      <TextField label={t(isPackage ? 'myServices.fieldDurationEach' : 'myServices.fieldDuration')} value={duration} onChangeText={(v) => setDuration(v.replace(/\D/g, ''))} keyboardType="number-pad" />
      <TextField label={t('myServices.fieldIncludes')} value={includesText} onChangeText={setIncludesText} multiline hint={t('myServices.includesHint')} />
      {userId ? <PhotosSection serviceId={id ?? null} userId={userId} /> : null}
      <Spacer />
      <Body>{t('myServices.where')}</Body>
      <Spacer size={8} />
      <ChipRow>
        {PLACES.map((p) => (
          <Chip
            key={p}
            label={t(`places.${p}`)}
            selected={places.includes(p)}
            onPress={() => setPlaces((current) => (current.includes(p) ? current.filter((x) => x !== p) : [...current, p]))}
          />
        ))}
      </ChipRow>
      {places.includes('sede') ? (
        <TextField label={t('myServices.spaceFee')} value={spaceFee} onChangeText={setSpaceFee} keyboardType="decimal-pad" hint={t('myServices.spaceFeeHint')} />
      ) : null}
      {places.includes('domicilio') ? <Body muted>{t('myServices.travelNote')}</Body> : null}
      <Spacer size={8} />
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
