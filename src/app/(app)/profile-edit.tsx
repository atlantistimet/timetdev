import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button, ErrorText, LoadingView, Screen, Spacer, TextField, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { centsToEuroText } from '@/lib/my-services';
import { loadMyProfile, saveMyProfile } from '@/lib/profile-edit';

export default function ProfileEditScreen() {
  const { t } = useTranslation();
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

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const p = await loadMyProfile(userId);
      if (!active) return;
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
  }, [userId]);

  if (!ready) return <LoadingView />;

  const save = async () => {
    if (!userId) return;
    setSaving(true);
    setErrorKey(null);
    const failure = await saveMyProfile(userId, { handle, roleTitle, city, bio, placeType, placeAddress, serviceArea, travelFee });
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
      {errorKey ? <ErrorText>{t(errorKey)}</ErrorText> : null}
      <Spacer />
      <Button title={t('policy.save')} onPress={() => void save()} loading={saving} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
