import '@livekit/components-styles';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LiveKitRoom, RoomAudioRenderer, VideoTrack, isTrackReference, useLocalParticipant, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Avatar } from '@/components/Avatar';
import type { CallRoomProps } from '@/components/call-room.types';
import { fonts, pastelFor, useTheme } from '@/theme';

function Stage({ onHangup, name, avatarPath, seed, myName, children, chat, onAddMinutes }: { onHangup: () => void } & Pick<CallRoomProps, 'name' | 'avatarPath' | 'seed' | 'myName' | 'children' | 'chat' | 'onAddMinutes'>) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [chatOpen, setChatOpen] = useState(false);
  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } = useLocalParticipant();
  const refs = useTracks([Track.Source.Camera, Track.Source.ScreenShare]).filter(isTrackReference);
  const theirScreen = refs.find((x) => !x.participant.isLocal && x.source === Track.Source.ScreenShare);
  const remote = theirScreen ?? refs.find((x) => !x.participant.isLocal && x.source === Track.Source.Camera);
  const local = refs.find((x) => x.participant.isLocal && x.source === Track.Source.Camera);
  const video = { width: '100%', height: '100%', objectFit: theirScreen ? 'contain' : 'cover' } as const;
  const round = (on: boolean, icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, dark?: boolean) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.round, { backgroundColor: dark && on ? theme.ink : theme.bg }]}>
      <Ionicons name={icon} size={24} color={dark && on ? '#FFFFFF' : theme.ink} />
    </Pressable>
  );
  return (
    <View style={styles.stage}>
      <View style={[styles.hero, chatOpen && styles.heroSmall, { backgroundColor: pastelFor(seed ?? name) }]}>
        {remote ? (
          <View style={StyleSheet.absoluteFill}>
            <VideoTrack trackRef={remote} style={video} />
          </View>
        ) : null}
        <View style={styles.heroTop}>
          <View style={[styles.tag, { backgroundColor: theme.accent }]}>
            <View style={[styles.dot, { backgroundColor: theme.ink }]} />
            <Text style={[styles.tagText, { color: theme.ink }]}>{theirScreen ? t('calls.theirScreen', { name }) : isScreenShareEnabled ? t('calls.sharing') : t('calls.inCall')}</Text>
          </View>
        </View>
        {!remote ? <Avatar name={name ?? '?'} seed={seed} size={chatOpen ? 96 : 168} round={chatOpen ? 34 : 56} path={avatarPath} /> : <View />}
        <View style={styles.heroBottom}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.heroName, { color: remote ? '#FFFFFF' : theme.ink }]}>{name}</Text>
            {!remote ? <Text style={[styles.heroSub, { color: theme.ink }]}>{t('calls.cameraOff')}</Text> : null}
          </View>
          <View style={[styles.preview, { backgroundColor: theme.initials }]}>
            {local && isCameraEnabled ? (
              <View style={StyleSheet.absoluteFill}>
                <VideoTrack trackRef={local} style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
              </View>
            ) : (
              <Text style={[styles.previewText, { color: theme.ink }]}>{(myName ?? '').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</Text>
            )}
          </View>
        </View>
      </View>
      {chat ? <View style={chatOpen ? styles.chatShown : styles.chatHidden}>{chat}</View> : null}
      {chatOpen ? null : children}
      <View style={[styles.bar, { backgroundColor: theme.surface }]}>
        {round(isMicrophoneEnabled, isMicrophoneEnabled ? 'mic' : 'mic-off', isMicrophoneEnabled ? t('calls.micOff') : t('calls.micOn'), () => void localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled))}
        {round(isCameraEnabled, isCameraEnabled ? 'videocam' : 'videocam-off', isCameraEnabled ? t('calls.camOff') : t('calls.camOn'), () => void localParticipant.setCameraEnabled(!isCameraEnabled), true)}
        {round(isScreenShareEnabled, 'desktop-outline', isScreenShareEnabled ? t('calls.screenStop') : t('calls.screenShare'), () => void localParticipant.setScreenShareEnabled(!isScreenShareEnabled).catch(() => {}), true)}
        {chat ? round(chatOpen, 'chatbubble', t('calls.chat'), () => setChatOpen((v) => !v), true) : null}
        {onAddMinutes ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('calls.addMinutes')} onPress={onAddMinutes} style={[styles.round, { backgroundColor: theme.accent }]}>
            <Ionicons name="add" size={28} color={theme.onAccent} />
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={t('calls.hangup')} onPress={onHangup} style={[styles.hang, { backgroundColor: '#D93A3F' }]}>
          <Ionicons name="call" size={26} color="#FFFFFF" style={{ transform: [{ rotate: '135deg' }] }} />
        </Pressable>
      </View>
    </View>
  );
}

/** Web: stessa stanza del telefono (video, tua anteprima, minuti, chat e file), con in più la condivisione schermo. */
export function CallRoom({ serverUrl, token, onDisconnected, name, avatarPath, seed, myName, children, chat, onAddMinutes }: CallRoomProps) {
  return (
    <View style={{ flex: 1 }}>
      <LiveKitRoom serverUrl={serverUrl} token={token} connect audio video onDisconnected={onDisconnected} style={{ flex: 1, display: 'flex' }}>
        <Stage onHangup={onDisconnected} name={name} avatarPath={avatarPath} seed={seed} myName={myName} chat={chat} onAddMinutes={onAddMinutes}>
          {children}
        </Stage>
        <RoomAudioRenderer />
      </LiveKitRoom>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, gap: 8 },
  hero: { flex: 1, minHeight: 260, borderRadius: 38, padding: 18, paddingTop: 48, overflow: 'hidden', justifyContent: 'space-between', alignItems: 'center' },
  heroSmall: { flex: 0, height: 250, minHeight: 0, paddingTop: 40 },
  chatShown: { flex: 1 },
  chatHidden: { display: 'none' },
  heroTop: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'flex-end' },
  tag: { height: 32, paddingHorizontal: 12, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  tagText: { fontFamily: fonts.semibold, fontSize: 13 },
  heroBottom: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  heroName: { fontFamily: fonts.semibold, fontSize: 30, letterSpacing: -1.2 },
  heroSub: { fontFamily: fonts.medium, fontSize: 14 },
  preview: { width: 74, height: 98, borderRadius: 24, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  previewText: { fontFamily: fonts.semibold, fontSize: 16 },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 6, borderRadius: 999, marginTop: 'auto' },
  round: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  hang: { width: 84, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
