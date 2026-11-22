/**
 * 041 — Catálogo local del selector de emojis: caracteres Unicode que dibuja
 * el sistema del operador, con nombres en español. Sin imágenes ni peticiones
 * a ningún sitio. La búsqueda y la inserción viven aquí para probarlas sin DOM.
 */
export const EMOJI_CATEGORIES = [
  { id: "faces", label: "Faces", icon: "😀" },
  { id: "gestures", label: "Gestures", icon: "👋" },
  { id: "hearts", label: "Hearts", icon: "❤️" },
  { id: "party", label: "Celebration", icon: "🎉" },
  { id: "nature", label: "Nature", icon: "🌸" },
  { id: "food", label: "Food", icon: "🍕" },
  { id: "objects", label: "Objects", icon: "💡" },
] as const;

export type EmojiCategory = (typeof EMOJI_CATEGORIES)[number]["id"];
export type Emoji = { value: string; label: string; category: EmojiCategory };

const groups: Record<EmojiCategory, readonly (readonly [string, string])[]> = {
  faces: [
    ["😀", "Smile"], ["😃", "Happy smile"], ["😄", "Laugh"], ["😁", "Beaming smile"],
    ["😆", "Laughing with closed eyes"], ["😅", "Smile with sweat"], ["😂", "Tears of joy"],
    ["🤣", "Rolling on the floor laughing"], ["😊", "Happy blush"], ["😉", "Wink"], ["😍", "In love"],
    ["🥰", "Affection"], ["😘", "Kiss"], ["😗", "Blow a kiss"], ["😋", "Yummy"],
    ["😛", "Sticking out tongue"], ["😜", "Wink with tongue"], ["🤪", "Zany"],
    ["😎", "Sunglasses"], ["🤩", "Star-struck"], ["🥳", "Party face"],
    ["🙂", "Slight smile"], ["🙃", "Upside-down face"], ["🤗", "Hug"], ["🤭", "Giggle"],
    ["🤔", "Thinking"], ["🤫", "Shush"], ["😐", "Neutral face"], ["😑", "Expressionless"],
    ["🙄", "Eye roll"], ["😏", "Smirk"], ["😌", "Relief"], ["😴", "Sleeping"],
    ["🥱", "Yawn"], ["😔", "Sad"], ["😢", "Crying"], ["😭", "Sobbing"],
    ["🥺", "Pleading"], ["😮", "Surprise"], ["😱", "Astonished"], ["😬", "Grimace"],
    ["😳", "Embarrassed"], ["😤", "Annoyed"], ["😡", "Angry"], ["🤯", "Mind blown"],
    ["🤒", "Sick"], ["🤕", "Hurt"], ["🤢", "Nauseated"], ["🤧", "Sneeze"],
    ["😇", "Angel"], ["🤠", "Cowboy"], ["🤡", "Clown"], ["👻", "Ghost"],
    ["🤖", "Robot"], ["💩", "Poop"], ["😺", "Smiling cat"], ["😻", "Cat in love"],
  ],
  gestures: [
    ["👋", "Greeting"], ["🤚", "Raised hand"], ["✋", "Stop"], ["🖐️", "Open hand"],
    ["👌", "OK"], ["🤌", "Pinched fingers"], ["✌️", "Peace"], ["🤞", "Crossed fingers"],
    ["🤟", "Love you"], ["🤘", "Rock"], ["🤙", "Call me"], ["👈", "Point left"],
    ["👉", "Point right"], ["👆", "Point up"], ["👇", "Point down"],
    ["☝️", "Attention"], ["👍", "Thumbs up"], ["👎", "Thumbs down"], ["✊", "Fist"],
    ["👊", "Fist bump"], ["👏", "Applause"], ["🙌", "Raising hands"],
    ["👐", "Open hands"], ["🤲", "Folded hands"], ["🤝", "Handshake"],
    ["🙏", "Thanks"], ["💪", "Strong"], ["✍️", "Writing"], ["👀", "Eyes"], ["🫶", "Heart hands"],
  ],
  hearts: [
    ["❤️", "Red heart"], ["🧡", "Orange heart"], ["💛", "Yellow heart"],
    ["💚", "Green heart"], ["💙", "Blue heart"], ["💜", "Purple heart"],
    ["🖤", "Black heart"], ["🤍", "White heart"], ["🤎", "Brown heart"],
    ["💖", "Sparkling heart"], ["💕", "Two hearts"], ["💗", "Growing heart"],
    ["💓", "Beating heart"], ["💞", "Revolving hearts"], ["💘", "Heart with arrow"],
    ["💝", "Heart with ribbon"], ["💔", "Broken heart"], ["❤️‍🔥", "Heart on fire"],
    ["❤️‍🩹", "Mending heart"], ["💌", "Love letter"], ["💋", "Kiss mark"], ["💯", "Hundred points"],
  ],
  party: [
    ["🎉", "Party popper"], ["🎊", "Confetti"], ["🎈", "Balloon"], ["🎁", "Gift"],
    ["🎀", "Ribbon"], ["🎂", "Birthday cake"], ["🧁", "Cupcake"], ["🕯️", "Candle"],
    ["✨", "Sparkles"], ["🌟", "Glowing star"], ["⭐", "Star"], ["💫", "Shine"],
    ["🎆", "Fireworks"], ["🎇", "Sparkler"], ["🪅", "Piñata"], ["🪩", "Disco ball"],
    ["🥂", "Cheers"], ["🍾", "Champagne"], ["🎵", "Musical note"], ["🎶", "Music"],
    ["🎤", "Microphone"], ["💃", "Dancer"], ["🕺", "Man dancing"], ["👑", "Crown"],
    ["🏆", "Trophy"], ["🏅", "Medal"], ["🎓", "Graduation"], ["💍", "Ring"],
  ],
  nature: [
    ["🌸", "Cherry blossom"], ["🌷", "Tulip"], ["🌹", "Rose"], ["🌻", "Sunflower"],
    ["💐", "Bouquet"], ["🌺", "Hibiscus"], ["🌼", "Daisy"], ["🌿", "Herb"],
    ["🍀", "Clover"], ["🌵", "Cactus"], ["🌴", "Palm tree"], ["🌳", "Tree"],
    ["☀️", "Sun"], ["🌈", "Rainbow"], ["☁️", "Cloud"], ["🌧️", "Rain"],
    ["❄️", "Snow"], ["🔥", "Fire"], ["💧", "Water drop"], ["🌙", "Moon"],
    ["🌎", "World"], ["🐶", "Dog"], ["🐱", "Cat"], ["🐰", "Rabbit"],
    ["🐻", "Bear"], ["🦄", "Unicorn"], ["🦋", "Butterfly"], ["🐝", "Bee"],
    ["🐥", "Chick"], ["🐢", "Turtle"], ["🐬", "Dolphin"], ["🦖", "Dinosaur"],
  ],
  food: [
    ["🍎", "Apple"], ["🍊", "Orange"], ["🍋", "Lemon"], ["🍌", "Banana"],
    ["🍉", "Watermelon"], ["🍇", "Grapes"], ["🍓", "Strawberry"], ["🍒", "Cherry"],
    ["🍍", "Pineapple"], ["🥑", "Avocado"], ["🌽", "Corn"], ["🌮", "Taco"],
    ["🌯", "Burrito"], ["🍕", "Pizza"], ["🍔", "Hamburger"], ["🍟", "French fries"],
    ["🌭", "Hot dog"], ["🍿", "Popcorn"], ["🍩", "Donut"], ["🍪", "Cookie"],
    ["🍫", "Chocolate"], ["🍬", "Candy"], ["🍭", "Lollipop"], ["🍦", "Ice cream"],
    ["☕", "Coffee"], ["🫖", "Tea"], ["🧃", "Juice"], ["🥤", "Soda"],
  ],
  objects: [
    ["✅", "Confirmed"], ["✔️", "Correct"], ["❌", "Cancel"], ["❗", "Important"],
    ["❓", "Question"], ["⚠️", "Warning"], ["🔔", "Bell"], ["📌", "Pushpin"],
    ["📍", "Location"], ["📅", "Calendar"], ["⏰", "Alarm"], ["⌛", "Hourglass"],
    ["📦", "Package"], ["🛍️", "Shopping"], ["🛒", "Cart"], ["🚚", "Delivery truck"],
    ["🚗", "Car"], ["🏠", "House"], ["🏪", "Store"], ["💡", "Idea"],
    ["📱", "Mobile phone"], ["☎️", "Phone"], ["💻", "Computer"], ["📷", "Camera"],
    ["📝", "Note"], ["📚", "Books"], ["✉️", "Envelope"], ["🔑", "Key"],
    ["🔒", "Lock"], ["🔗", "Link"], ["🔧", "Wrench"], ["🔨", "Hammer"],
    ["⚽", "Soccer"], ["🏀", "Basketball"],
  ],
};

export const EMOJIS: readonly Emoji[] = EMOJI_CATEGORIES.flatMap(({ id }) =>
  groups[id].map(([value, label]) => ({ value, label, category: id }))
);

/** Minúsculas y sin acentos: «corazon» encuentra «Corazón». */
export function emojiSearchText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es");
}

/**
 * Lo que enseña el selector: con búsqueda, en todo el catálogo (la búsqueda
 * manda sobre la categoría); sin ella, la categoría elegida o todo.
 */
export function filterEmojis(search: string, category: EmojiCategory | "all"): readonly Emoji[] {
  const query = emojiSearchText(search.trim());
  if (query) {
    return EMOJIS.filter(
      (emoji) => emojiSearchText(emoji.label).includes(query) || emoji.value === search.trim()
    );
  }
  return category === "all" ? EMOJIS : EMOJIS.filter((emoji) => emoji.category === category);
}

/**
 * Inserta en el cursor o reemplaza la selección, y dice dónde queda el cursor:
 * justo detrás del emoji, en unidades UTF-16 (lo que usa `setSelectionRange`).
 */
export function insertAtSelection(
  text: string,
  start: number,
  end: number,
  emoji: string
): { text: string; caret: number } {
  const from = Math.max(0, Math.min(start, end, text.length));
  const to = Math.max(from, Math.min(Math.max(start, end), text.length));
  return { text: text.slice(0, from) + emoji + text.slice(to), caret: from + emoji.length };
}
