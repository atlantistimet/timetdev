import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { TierLines } from '@/components/TierLines';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listPolicies, STANDARD_TIERS, type CancelPolicy } from '@/lib/cancel-policy';

export default function PoliciesScreen() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [result, setResult] = useState<{ policies: CancelPolicy[]; errorKey: string | null } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const r = await listPolicies(userId);
      if (active) setResult(r);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (!result) return <LoadingView />;

  return (
    <Screen>
      <Title>{t('policy.title')}</Title>
      <Body muted>{t('policy.intro')}</Body>
      <Spacer />
      {result.errorKey ? <ErrorText>{t(result.errorKey)}</ErrorText> : null}
      {result.policies.length === 0 ? (
        <>
          <Body>{t('policy.standardName')}</Body>
          <TierLines tiers={STANDARD_TIERS} />
          <Spacer size={8} />
          <Body muted>{t('policy.usingStandard')}</Body>
        </>
      ) : null}
      {result.policies.map((policy) => (
        <Card key={policy.id}>
          <Body>
            {policy.name}
            {policy.is_default ? ` · ${t('policy.default')}` : ''}
          </Body>
          <TierLines tiers={policy.tiers} />
          <Spacer size={8} />
          <Button title={t('policy.edit')} variant="ghost" onPress={() => router.push({ pathname: '/policy-edit', params: { id: policy.id } })} />
        </Card>
      ))}
      <Spacer size={24} />
      <Button title={t('policy.new')} onPress={() => router.push('/policy-edit')} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
