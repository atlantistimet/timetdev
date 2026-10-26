import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Body, Button, Card, ErrorText, LoadingView, Screen, Spacer, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatEuro } from '@/lib/booking';
import { DeleteButton } from '@/components/DeleteButton';
import { countFutureBookings } from '@/lib/my-services';
import { deleteLink, linkUrl, listMyLinks, listPastLinks, shareText, type SlotLink } from '@/lib/slot-links';
import { dayLabel } from '@/lib/time';
import { discountedCents } from '@/lib/validity';

export default function SlotLinksScreen() {
  const { t, i18n } = useTranslation();
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<{ links: SlotLink[]; past: SlotLink[]; errorKey: string | null } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [now, setNow] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      const [r, past] = await Promise.all([listMyLinks(userId), listPastLinks(userId)]);
      if (active) {
        setLoaded({ ...r, past });
        setNow(Date.now());
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, reloadKey]);

  if (!loaded) return <LoadingView />;

  const share = async (link: SlotLink) => {
    const r = await shareText(`${link.message ? `${link.message}\n` : ''}${linkUrl(link.code)}`);
    setNote(r === 'copied' ? t('slotLinks.copied') : r === 'failed' ? t('errors.generic') : null);
  };
  const remove = async (link: SlotLink) => {
    const failure = await deleteLink(link.id);
    setNote(failure ? t(failure) : null);
    setReloadKey((k) => k + 1);
  };

  return (
    <Screen>
      <Title>{t('slotLinks.title')}</Title>
      <Body muted>{t('slotLinks.intro')}</Body>
      <Spacer />
      {loaded.errorKey ? <ErrorText>{t(loaded.errorKey)}</ErrorText> : null}
      {note ? <Body muted>{note}</Body> : null}
      {!loaded.errorKey && loaded.links.length === 0 ? <Body muted>{t('slotLinks.empty')}</Body> : null}
      {loaded.links.map((link) => {
        const expired = !!link.expires_at && new Date(link.expires_at).getTime() < now;
        return (
          <Card key={link.id}>
            <Body>
              {link.service_title}
              {link.discount_pct ? ` · −${link.discount_pct}%` : ''}
              {expired ? ` · ${t('slotLinks.expired')}` : ''}
            </Body>
            <Body muted>
              {formatEuro(discountedCents(link.price_cents, link.discount_pct), i18n.language)} · {link.duration_min} min
            </Body>
            {link.starts_at ? (
              <Body muted>{new Intl.DateTimeFormat(i18n.language, { dateStyle: 'full', timeStyle: 'short' }).format(new Date(link.starts_at))}</Body>
            ) : (
              <>
                <Body muted>{link.days.map((d) => dayLabel(d, i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })).join(', ')}</Body>
                <Body muted>{link.ranges.map((r) => `${r.from}–${r.to}`).join(', ')}</Body>
              </>
            )}
            <Spacer size={8} />
            {!expired ? <Button title={t('slotLinks.share')} variant="ghost" onPress={() => void share(link)} /> : null}
            <Spacer size={8} />
            <DeleteButton label={t('slotLinks.delete')} warning={t('slotLinks.deleteWarning')} loadCount={() => countFutureBookings('slot_link_id', link.id)} onConfirm={() => remove(link)} />
          </Card>
        );
      })}
      {loaded.past.length > 0 ? (
        <>
          <Spacer />
          <Title>{t('slotLinks.pastTitle')}</Title>
          <Body muted>{t('slotLinks.pastHelp')}</Body>
          {loaded.past.map((link) => (
            <Card key={link.id}>
              <Body>{link.service_title}</Body>
              <Body muted>
                {t('delete.deletedOn', { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(link.deleted_at ?? 0)) })}
              </Body>
            </Card>
          ))}
        </>
      ) : null}
      <Spacer size={16} />
      <Button title={t('slotLinks.new')} onPress={() => router.push('/slot-link-edit')} />
      <Spacer size={12} />
      <Button title={t('common.back')} variant="ghost" onPress={() => router.replace('/seller')} />
    </Screen>
  );
}
