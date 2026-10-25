import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AvailabilityPanel } from '@/components/AvailabilityPanel';
import { Body, Button, Chip, ChipRow, ErrorText, Spacer } from '@/components/ui';
import {
  cloneDraft, deleteSchedule, emptyDraft, loadInherited, loadSchedule, saveSchedule, validateDraft, type Scope, type ScheduleDraft,
} from '@/lib/availability';

type Params = {
  sellerId: string | null;
  scope: 'service' | 'offer';
  targetId: string | null; // null = servizio/offerta non ancora creati
  /** Servizio da cui si eredita (per un'offerta: il suo servizio; per un servizio: nessuno, si eredita la generale). */
  inheritServiceId: string | null;
};

/** Stato della disponibilità specifica di un servizio o di un'offerta: caricata, modificata e poi salvata insieme al resto. */
export function useSpecificAvailability({ sellerId, scope, targetId, inheritServiceId }: Params) {
  const [loaded, setLoaded] = useState(false);
  const [specific, setSpecific] = useState(false);
  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [storedId, setStoredId] = useState<string | null>(null);

  useEffect(() => {
    if (!sellerId) return;
    let alive = true;
    (async () => {
      const stored = targetId ? await loadSchedule(sellerId, scope as Scope, targetId) : null;
      if (!alive) return;
      setStoredId(stored?.id ?? null);
      setSpecific(!!stored);
      setDraft(stored ? cloneDraft(stored) : null);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [sellerId, scope, targetId]);

  /** Passa a "specifica": parte da una copia di quella che vale ora (generale, o quella del servizio). */
  const startSpecific = useCallback(async () => {
    if (!sellerId) return;
    const base = await loadInherited(sellerId, inheritServiceId, Date.now());
    setDraft(base);
    setSpecific(true);
  }, [sellerId, inheritServiceId]);

  const errors = draft && specific ? validateDraft(draft) : {};
  const valid = !specific || Object.keys(errors).length === 0;

  /** Da chiamare dopo aver salvato il servizio/l'offerta (serve il suo id). */
  const persist = useCallback(async (id: string): Promise<string | null> => {
    if (specific && draft) {
      const failure = await saveSchedule(scope, scope === 'service' ? id : null, scope === 'offer' ? id : null, draft);
      return failure;
    }
    if (!specific && storedId) {
      const failure = await deleteSchedule(storedId);
      if (!failure) setStoredId(null);
      return failure;
    }
    return null;
  }, [specific, draft, scope, storedId]);

  return { loaded, specific, draft, setDraft, setSpecific, startSpecific, hadStored: !!storedId, errors, valid, persist };
}

export type SpecificState = ReturnType<typeof useSpecificAvailability>;

/** Le due opzioni (generale/servizio predefinita oppure specifica) e, se specifica, il pannello. */
export function SpecificAvailabilityPicker({ state, defaultLabel, specificLabel }: { state: SpecificState; defaultLabel: string; specificLabel: string }) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  if (!state.loaded) return null;
  return (
    <>
      <Body>{t('availability.pickerTitle')}</Body>
      <Spacer size={8} />
      <ChipRow>
        <Chip
          label={defaultLabel}
          selected={!state.specific}
          onPress={() => {
            if (!state.specific) return;
            if (state.hadStored) setConfirming(true); // la specifica già salvata si cancella solo dopo conferma
            else {
              state.setSpecific(false);
              state.setDraft(null);
            }
          }}
        />
        <Chip label={specificLabel} selected={state.specific} onPress={() => { setConfirming(false); if (!state.specific) void state.startSpecific(); }} />
      </ChipRow>
      {confirming ? (
        <>
          <Spacer size={8} />
          <ErrorText>{t('availability.confirmRemove')}</ErrorText>
          <Button title={t('availability.confirmRemoveYes')} onPress={() => { state.setSpecific(false); state.setDraft(null); setConfirming(false); }} />
          <Spacer size={8} />
          <Button title={t('common.cancel')} variant="ghost" onPress={() => setConfirming(false)} />
        </>
      ) : null}
      {state.specific && state.draft ? (
        <>
          <Spacer size={8} />
          <AvailabilityPanel draft={state.draft} onChange={state.setDraft} errors={state.errors} />
        </>
      ) : null}
    </>
  );
}

export { emptyDraft };
