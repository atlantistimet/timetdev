import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pressable } from '@/components/Pressable';
import { fonts, pastels, useTheme } from '@/theme';

// Immagine provvisoria: sostituire assets/welcome.jpg con la foto definitiva.
const background = require('../../assets/welcome.jpg');
const people = ['MA', 'GI', 'LU', 'SO'];

export default function Welcome() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  return (
    <ImageBackground source={background} resizeMode="cover" style={styles.fill}>
      <View style={styles.shade} />
      <SafeAreaView style={styles.fill}>
        <View style={styles.inner}>
          <Text style={[styles.brand, { color: '#FFFFFF' }]}>timeet</Text>
          <View style={styles.bottom}>
            <View style={styles.faces}>
              {people.map((p, i) => (
                <View key={p} style={[styles.face, { backgroundColor: pastels[i % pastels.length], marginLeft: i === 0 ? 0 : -14 }]}>
                  <Text style={[styles.faceText, { color: theme.ink }]}>{p}</Text>
                </View>
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
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#151515' },
  shade: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.38)' },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16, justifyContent: 'space-between', width: '100%', maxWidth: 440, alignSelf: 'center' },
  brand: { fontFamily: fonts.semibold, fontSize: 26, letterSpacing: -1 },
  bottom: { gap: 12 },
  faces: { flexDirection: 'row', marginBottom: 8 },
  face: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#151515' },
  faceText: { fontFamily: fonts.semibold, fontSize: 16 },
  title: { fontFamily: fonts.semibold, fontSize: 40, lineHeight: 42, letterSpacing: -1.8, color: '#FFFFFF' },
  sub: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: 'rgba(255,255,255,0.82)', marginBottom: 8 },
  primary: { borderRadius: 999, paddingVertical: 17, alignItems: 'center' },
  primaryText: { fontFamily: fonts.semibold, fontSize: 17 },
  secondary: { borderRadius: 999, paddingVertical: 17, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  secondaryText: { fontFamily: fonts.semibold, fontSize: 17, color: '#FFFFFF' },
  age: { fontFamily: fonts.medium, fontSize: 13, color: 'rgba(255,255,255,0.65)', textAlign: 'center', marginTop: 4 },
});
