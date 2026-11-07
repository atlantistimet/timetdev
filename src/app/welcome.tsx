import { Image, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable } from '@/components/Pressable';
import { fonts, useTheme } from '@/theme';

// Immagine provvisoria: sostituire assets/welcome.jpg con la foto definitiva.
const background = require('../../assets/welcome.jpg');
// Foto dei profili di prova (non cliccabili).
const faces = [
  require('../../assets/welcome/face1.jpg'),
  require('../../assets/welcome/face2.jpg'),
  require('../../assets/welcome/face3.jpg'),
  require('../../assets/welcome/face4.jpg'),
  require('../../assets/welcome/face5.jpg'),
];

export default function Welcome() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  return (
    <View style={[styles.fill, { width, height }]}>
      <Image source={background} resizeMode="cover" accessible={false} style={[styles.photo, { width, height }]} />
      <View style={styles.shade} />
      <SafeAreaView style={styles.safe}>
        <View style={styles.inner}>
          <Text style={[styles.brand, { color: '#FFFFFF' }]}>timeet</Text>
          <View style={styles.bottom}>
            <View style={styles.faces}>
              {faces.map((src, i) => (
                <Image key={i} source={src} accessible={false} style={[styles.face, { marginLeft: i === 0 ? 0 : -14 }]} />
              ))}
            </View>
            <Text style={styles.title}>{t('welcome.title')}</Text>
            <Text style={styles.sub}>{t('welcome.subtitle')}</Text>
            <Pressable accessibilityRole="button" onPress={() => router.push('/register')} style={[styles.primary, { backgroundColor: theme.accent }]}>
              <Text style={[styles.primaryText, { color: theme.onAccent }]}>{t('welcome.email')}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.secondary}>
              <Text style={styles.secondaryText}>{t('welcome.haveAccount')}</Text>
            </Pressable>
            <Text style={styles.age}>{t('welcome.age')}</Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#151515' },
  safe: { flex: 1 },
  photo: { position: 'absolute', top: 0, left: 0 },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, justifyContent: 'space-between', width: '100%', maxWidth: 440, alignSelf: 'center' },
  brand: { fontFamily: fonts.semibold, fontSize: 26, letterSpacing: -1 },
  bottom: { gap: 12 },
  faces: { flexDirection: 'row', marginBottom: 8 },
  face: { width: 48, height: 48, borderRadius: 24, borderWidth: 2.5, borderColor: '#151515' },
  title: { fontFamily: fonts.semibold, fontSize: 40, lineHeight: 42, letterSpacing: -1.8, color: '#FFFFFF' },
  sub: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: 'rgba(255,255,255,0.82)', marginBottom: 8 },
  primary: { borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  primaryText: { fontFamily: fonts.semibold, fontSize: 17 },
  secondary: { borderRadius: 999, paddingVertical: 17, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 17, color: '#FFFFFF' },
  age: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', marginTop: 4 },
});
