import { useTranslation } from 'react-i18next';
import { Body, Chip, ChipRow, Spacer, TextField } from '@/components/ui';
import { PLACES, type Place } from '@/lib/my-services';

/** Campi per creare un servizio senza uscire dalla schermata (offerta o link). Prezzo e durata si indicano nel modulo che lo contiene. */
export function NewServiceFields({
  title,
  onTitle,
  places,
  onPlaces,
}: {
  title: string;
  onTitle: (v: string) => void;
  places: Place[];
  onPlaces: (p: Place[]) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Spacer size={8} />
      <Body muted>{t('newService.note')}</Body>
      <TextField label={t('newService.name')} value={title} onChangeText={onTitle} maxLength={80} placeholder={t('newService.namePlaceholder')} />
      <Body>{t('newService.where')}</Body>
      <Spacer size={8} />
      <ChipRow>
        {PLACES.map((p) => (
          <Chip key={p} label={t(`places.${p}`)} selected={places.includes(p)} onPress={() => onPlaces(places.includes(p) ? places.filter((x) => x !== p) : [...places, p])} />
        ))}
      </ChipRow>
    </>
  );
}
