# 🧠 Learn by Heart

A small web app that helps kids memorize texts (English or Arabic).

1. A parent adds a text: a poem, a surah, a times table, anything.
2. The child taps 🎤 and recites it from memory.
3. The app listens. Each word **appears as the child says it** (green).
4. If the child **pauses** (3 seconds by default), the **next word appears as a hint** (orange).
5. At the end the child gets 1–3 ⭐ depending on how many words they said without hints.

Other buttons:
- 💡 **Hint**: show the next word now (tapping the highlighted blank does the same).
- 👀 **Peek**: tap to see the whole text for 2 seconds, or hold it down to keep it showing.
- ↺ **Start over**.

Above the mic, a **🐢 ↔ 🐇 speed slider** sets how long the app waits (1–10 seconds) before showing the next word.

In ⚙️ Settings you can choose **how strict** listening is (Easy / Normal / Strict), turn automatic hints off, how hidden words look
(bars that show word length, dots, or nothing), the English accent and Arabic dialect used for
listening, and turn on a line under the text showing what the app heard (useful for parents).

## Arabic

Diacritics (tashkeel) are ignored when comparing, and أ/إ/آ/ا, ة/ه and ى/ي count as the same
letter, so you can paste fully vowelled text (e.g. Qur'an) and the child's speech will still match.
The text is displayed with its diacritics, right to left.

## If words aren't being recognized

1. In ⚙️ Settings, turn on **Show what the app heard**. A line under the text then shows what the
   speech recognizer understood.
   - If that line shows **the right words** but they don't light up, the app's matching is at
     fault. Please report the example.
   - If it shows **wrong words**, the recognizer is mishearing. Try the steps below.
2. Check the **Arabic dialect / English accent** in Settings. For Qur'an and Fusha, *Saudi Arabia*
   usually works best.
3. Set **How strict** to **Easy**. Every word your child says then reveals the next word, even
   when the recognizer mishears it. That keeps the "words appear as I speak" experience for
   young children whose speech the recognizer struggles with.
4. Speak close to the device, in a quiet room.
5. On iPhone/iPad: make sure **Settings → General → Keyboard → Enable Dictation** is on.

## Which browsers work

The app uses the browser's built-in speech recognition (Web Speech API):

| Works | Doesn't work |
|---|---|
| Chrome (Android, Windows, Mac, ChromeOS), Edge, Safari (iPhone/iPad/Mac) | Firefox |

You need an internet connection, because the browser sends the audio to its speech service
(Google for Chrome, Apple for Safari). The microphone only works on `https://` pages
(or `localhost`).

## Running it

Everything is static files with no build step.

**Online (recommended, to use it on a tablet or phone):** turn on GitHub Pages for this repo
(Settings → Pages → *Deploy from a branch* → pick the branch and `/ (root)`). Open the URL on
the kids' device and use "Add to Home Screen" to get an app icon.

**Locally:** `npm start`, then open http://localhost:8080.

Texts and settings are saved in the browser on that device (localStorage).

## Development

- `matcher.js`: word normalization (English + Arabic) and the position tracker. Pure logic, no DOM.
- `app.js`: screens, storage, speech recognition, hint timer.
- `npm test`: runs the matcher tests in Node.
