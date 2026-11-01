// Emoji Microsoft Fluent 3D (licenza MIT, github.com/microsoft/fluentui-emoji), ridotte a 128 px.
// La chiave è quella salvata nel database (categories.emoji): per aggiungerne una basta copiare il PNG e una riga qui.
import type { ImageSourcePropType } from 'react-native';

export const EMOJI = {
  airplane: require('../../assets/emoji/airplane.png'),
  artist_palette: require('../../assets/emoji/artist_palette.png'),
  balance_scale: require('../../assets/emoji/balance_scale.png'),
  books: require('../../assets/emoji/books.png'),
  bread: require('../../assets/emoji/bread.png'),
  briefcase: require('../../assets/emoji/briefcase.png'),
  calendar: require('../../assets/emoji/calendar.png'),
  camera: require('../../assets/emoji/camera.png'),
  clapping_hands: require('../../assets/emoji/clapping_hands.png'),
  dog_face: require('../../assets/emoji/dog_face.png'),
  fire: require('../../assets/emoji/fire.png'),
  flexed_biceps: require('../../assets/emoji/flexed_biceps.png'),
  gift: require('../../assets/emoji/gift.png'),
  graduation_cap: require('../../assets/emoji/graduation_cap.png'),
  guitar: require('../../assets/emoji/guitar.png'),
  hammer_and_wrench: require('../../assets/emoji/hammer_and_wrench.png'),
  handshake: require('../../assets/emoji/handshake.png'),
  headphone: require('../../assets/emoji/headphone.png'),
  heart_hands: require('../../assets/emoji/heart_hands.png'),
  herb: require('../../assets/emoji/herb.png'),
  house: require('../../assets/emoji/house.png'),
  laptop: require('../../assets/emoji/laptop.png'),
  light_bulb: require('../../assets/emoji/light_bulb.png'),
  lipstick: require('../../assets/emoji/lipstick.png'),
  lotus: require('../../assets/emoji/lotus.png'),
  magnifying_glass_tilted_left: require('../../assets/emoji/magnifying_glass_tilted_left.png'),
  megaphone: require('../../assets/emoji/megaphone.png'),
  memo: require('../../assets/emoji/memo.png'),
  microphone: require('../../assets/emoji/microphone.png'),
  money_bag: require('../../assets/emoji/money_bag.png'),
  musical_note: require('../../assets/emoji/musical_note.png'),
  paintbrush: require('../../assets/emoji/paintbrush.png'),
  party_popper: require('../../assets/emoji/party_popper.png'),
  pencil: require('../../assets/emoji/pencil.png'),
  raising_hands: require('../../assets/emoji/raising_hands.png'),
  rocket: require('../../assets/emoji/rocket.png'),
  scissors: require('../../assets/emoji/scissors.png'),
  shopping_bags: require('../../assets/emoji/shopping_bags.png'),
  smiling_eyes: require('../../assets/emoji/smiling_eyes.png'),
  spaghetti: require('../../assets/emoji/spaghetti.png'),
  sparkles: require('../../assets/emoji/sparkles.png'),
  speaking_head: require('../../assets/emoji/speaking_head.png'),
  speech_balloon: require('../../assets/emoji/speech_balloon.png'),
  star: require('../../assets/emoji/star.png'),
  stopwatch: require('../../assets/emoji/stopwatch.png'),
  studio_microphone: require('../../assets/emoji/studio_microphone.png'),
  telephone_receiver: require('../../assets/emoji/telephone_receiver.png'),
  thumbs_up: require('../../assets/emoji/thumbs_up.png'),
  trophy: require('../../assets/emoji/trophy.png'),
  video_camera: require('../../assets/emoji/video_camera.png'),
  waving_hand: require('../../assets/emoji/waving_hand.png'),
  wrench: require('../../assets/emoji/wrench.png'),
} satisfies Record<string, ImageSourcePropType>;

export type EmojiKey = keyof typeof EMOJI;

export const EMOJI_KEYS = Object.keys(EMOJI) as EmojiKey[];

export function emojiSource(key: string | null | undefined): ImageSourcePropType | null {
  return key && key in EMOJI ? EMOJI[key as EmojiKey] : null;
}
