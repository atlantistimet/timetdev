import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Chip, ChipRow, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { centsToEuroText } from '@/lib/my-services';
import { loadCategories, loadMyCategories, saveMyCategories, setAvailableNow, MAX_CATEGORIES, type Category } from '@/lib/explore';
import { loadMyProfile, saveMyProfile } from '@/lib/profile-edit';

export default function ProfileEditScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [handle, setHandle] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [placeType, setPlaceType] = useState('');
  const [placeAddress, setPlaceAddress] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [travelFee, setTravelFee] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [until, setUntil] = useState<string | null>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const [p, cats, mine] = await Promise.all([loadMyProfile(userId), loadCategories(i18n.language), loadMyCategories(userId)]);
      if (!active) return;
      setCategories(cats);
      setPicked(mine);
      setUntil(p?.available_until ?? null);
      setNow(Date.now());
      if (p) {
        setHandle(p.handle ?? '');
        setRoleTitle(p.role_title ?? '');
        setCity(p.city ?? '');
        setBio(p.bio ?? '');
        setPlaceType(p.place_type ?? '');
        setPlaceAddress(p.place_address ?? '');
        setServiceArea(p.service_area ?? '');
        setTravelFee(p.travel_fee_cents ? centsToEuroText(p.travel_fee_cents) : '');
      }
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [userId, i18n.language]);

  if (!ready) return <LoadingView />;

  const toggleCategory = (key: string) =>
    setPicked((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : cur.length >= MAX_CATEGORIES ? cur : [...cur, key]));

  const setAvailability = async (hours: number | null) => {
    if (!userId) return;
    const failure = await setAvailableNow(userId, hours);
    if (failure) setErrorKey(failure);
    else {
      const t0 = Date.now();
      setNow(t0);
      setUntil(hours ? new Date(t0 + hours * 3_600_000).toISOString() : null);
    }
  };
  const activeUntil = until && new Date(until).getTime() > now ? new Date(until).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' }) : null;

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    setErrorKey(null);
    const failure = (await saveMyProfile(userId, { handle, roleTitle, city, bio, placeType, placeAddress, serviceArea, travelFee })) ?? (await saveMyCategories(userId, picked));
    setSaving(false);
    if (failure) setErrorKey(failure);
    else router.replace('/seller');
  };

  return (
    <Screen>
      <Title>{t('profileEdit.title')}</Title>
      <Spacer />
      <TextField label={t('profileEdit.handle')} value={handle} onChangeText={setHandle} autoCapitalize="none" autoCorrect={false} maxLength={30} hint={t('profileEdit.handleHint')} />
      <TextField label={t('profileEdit.roleTitle')} value={roleTitle} onChangeText={setRoleTitle} maxLength={60} />
      <TextField label={t('profileEdit.city')} value={city} onChangeText={setCity} maxLength={60} />
      <TextField label={t('profileEdit.bio')} value={bio} onChangeText={setBio} multiline maxLength={500} />
      <Spacer size={8} />
      <TextField label={t('profileEdit.placeType')} value={placeType} onChangeText={setPlaceType} maxLength={40} hint={t('profileEdit.placeTypeHint')} />
      <TextField label={t('profileEdit.placeAddress')} value={placeAddress} onChangeText={setPlaceAddress} maxLength={160} hint={t('profileEdit.placeAddressHint')} />
      <TextField label={t('profileEdit.serviceArea')} value={serviceArea} onChangeText={setServiceArea} maxLength={120} />
      <TextField label={t('profileEdit.travelFee')} value={travelFee} onChangeText={setTravelFee} keyboardType="decimal-pad" hint={t('profileEdit.travelFeeHint')} />
      <Spacer size={8} />
      <Body>{t('explore.categories')}</Body>
      <ChipRow>
        {categories.map((c) => (
          <Chip key={c.key} label={c.name} selected={picked.includes(c.key)} onPress={() => toggleCategory(c.key)} />
        ))}
      </ChipRow>
      <Spacer size={8} />
      <Body>{t('explore.availability')}</Body>
      <Body muted>{activeUntil ? t('explore.activeUntil', { time: activeUntil }) : t('explore.availabilityHint')}</Body>
      <ChipRow>
        <Chip label={t('explore.hours1')} selected={false} onPress={() => void setAvailability(1)} />
        <Chip label={t('explore.hours2')} selected={false} onPress={() => void setAvailability(2)} />
        <Chip label={t('explore.hours4')} selected={false} onPress={() => void setAvailability(4)} />
        <Chip label={t('explore.off')} selected={!activeUntil} onPress={() => void setAvailability(null)} />
      </ChipRow>
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Spacer />
      <Button title={t('policy.save')} onPress={() => void save()} loading={saving} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
