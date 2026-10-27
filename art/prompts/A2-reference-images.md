# A2: reference images for the other 10 device models

Same method as [A2-infusion-pump.md](A2-infusion-pump.md). Each image is made in a new chat in the Gemini web app, with "Create image", on 27 Oct 2026.
Sizes are the seeded `sizeCm` (width × depth × height) from `db/seed/reference.ts`. All names are generic; no real brand.

Every prompt ends with the same closing text, so the set matches:

```
Plain seamless light grey studio background, soft even lighting, gentle contact shadow, no reflections.
No text, no logos, no brand names, no labels, no people, no hands, no other objects.
Photorealistic, sharp focus, square image.
```

Every prompt starts: `Product reference photo of a generic hospital <device>, for use as a 3D modelling reference. Single device, three-quarter front view from slightly above, centred, whole device in frame with margin.`

| # | Model (slug) | Size cm | Description in the prompt |
|---|---|---|---|
| 1 | Syringe driver SD-50 (`syringe-driver`) | 30 × 12 × 12 | A slim horizontal off-white plastic box about 30 cm long, 12 cm deep and 12 cm tall. An empty syringe cradle runs along the top, with a hinged barrel clamp and a sliding plunger driver. Small monochrome LCD screen and a few grey buttons on the front face, a pole clamp on the back. No syringe fitted, no tubing. |
| 2 | Critical care ventilator CV-800 (`ventilator`) | 55 × 60 × 145 | An intensive care ventilator on its mobile stand, about 145 cm tall overall. A large colour touchscreen on an adjustable arm above a compact light grey main unit with breathing circuit ports on the front. A wheeled stand with four lockable castors, a small basket and a gas cylinder holder. No tubing, no breathing circuit fitted. |
| 3 | Monitor defibrillator DM-400 (`defibrillator`) | 32 × 28 × 30 | A portable monitor-defibrillator in a rugged dark grey case about 32 cm wide, 28 cm deep and 30 cm tall, with a moulded carry handle on top. A colour screen on the left of the front, an energy selection dial and a large round shock button on the right, a pads connector on the side and fabric accessory pouches on both sides. No cables, no pads. |
| 4 | Bedside patient monitor PM-12 (`patient-monitor`) | 33 × 18 × 30 | A bedside patient monitor with a 12-inch colour screen in a slim white bezel, about 33 cm wide, 18 cm deep and 30 cm tall, with a carry handle on top. A row of hard keys and a rotary control knob below the screen, a panel of round sensor sockets on the side. The screen shows generic coloured waveforms with no numbers or words. No cables. |
| 5 | Spot-check vital signs monitor VS-3 (`spot-check-vital-signs-monitor`) | 22 × 15 × 25 | A compact spot-check vital signs monitor about 22 cm wide, 15 cm deep and 25 cm tall, in white and pale blue plastic. A small colour screen on the front, a few buttons, a thermometer probe holder on one side and a holster for a blood pressure hose on the other, a carry handle on top. No cuff, no cables. |
| 6 | 12-lead ECG recorder EC-12 (`ecg-machine`) | 35 × 30 × 12 | A flat desktop 12-lead ECG recorder about 35 cm wide, 30 cm deep and 12 cm tall, in off-white plastic. A landscape colour screen and a full membrane keyboard on the top face, a built-in paper printer slot at the back edge, and a patient cable socket on the side. No cables, no paper output. |
| 7 | Portable suction unit SU-20 (`suction-unit`) | 30 × 25 × 35 | A portable medical suction unit about 30 cm wide, 25 cm deep and 35 cm tall. A light grey moulded base with a round vacuum gauge, a regulator knob and an on/off rocker switch on the front, a clear plastic collection canister with a lid held in a bracket on the side, and a carry handle on top. No tubing. |
| 8 | Mobile patient hoist PH-180 (`patient-hoist`) | 70 × 120 × 190 | A mobile electric patient hoist about 190 cm tall, on a U-shaped adjustable-width base with four small castors. A white vertical mast with a grey battery pack, a lifting boom at the top with a spreader bar and two hooks at each end, and a hand control on a coiled cable hanging from the mast. No sling, no patient. |
| 9 | Electric hospital bed HB-90 (`hospital-bed`) | 100 × 220 × 60 | An electric hospital bed about 220 cm long and 100 cm wide, at its lowest height. A four-section platform with a plain blue-grey mattress, light grey head and foot boards, split side rails raised on both sides, large central-locking castors, and a corded handset clipped to a side rail. No bedding, no pillows. |
| 10 | Electrical safety analyser SA-62 (`electrical-safety-analyser`) | 30 × 25 × 12 | A benchtop electrical safety analyser about 30 cm wide, 25 cm deep and 12 cm tall, in a dark grey case with a folding carry handle. The front panel has a small colour display, a rotary selector, a mains test socket, a row of coloured banana jack terminals and applied-part terminals. No test leads plugged in. |

## Results (27 Oct 2026)

Each image sits in its own Gemini chat. The Claude app's built-in browser refuses downloads ("Couldn't download image"). So the files were downloaded at full size through the user's own Chrome (Claude in Chrome), signed in to the same Gemini account, and saved as `art/refs/<model slug>.jpg`.

Gemini's full-size download is a 2048 × 2048 JPEG, so the files stay `.jpg`; renaming them `.png` would not change the format. The exception is the electrical safety analyser: its full-size download stalls in Chrome, so `electrical-safety-analyser.jpg` is the 1024 × 1024 preview. Regenerate it, or try the download again later, if A3 needs more detail.

Full-size check for lettering (the "check at full size" notes below):
- defibrillator and analyser: icons and dial marks only, with no words, brand names or logos;
- ECG recorder: its keyboard has letters on the keys (Esc, F1–F12, a QWERTY layout). That is not a brand, but blank the keys in the texture if the model should carry no text.

| # | Model | Gemini chat | What came out (file in `art/refs/`) |
|---|---|---|---|
| 1 | Syringe driver | [98b1b52f029f5cb4](https://gemini.google.com/app/98b1b52f029f5cb4) | Matches the brief: slim off-white body, empty cradle with barrel clamp and plunger driver, small LCD and keypad. |
| 2 | Ventilator | [d90b21df3a03abf1](https://gemini.google.com/app/d90b21df3a03abf1) | Touchscreen on an arm, grey main unit with ports, column stand with a basket and five castors. The first try came back as text, because image mode wasn't on; it was redone in a new chat. |
| 3 | Defibrillator | [9f06b13985c7be1b](https://gemini.google.com/app/9f06b13985c7be1b) | Rugged dark grey case, screen left, dial and red shock button right, side pouches. Check the small panel markings for lettering once the image is full size. |
| 4 | Patient monitor | [b400812a85aeb899](https://gemini.google.com/app/b400812a85aeb899) | White bezel, coloured waveforms with no numbers, keys and knob below, sockets on the side. |
| 5 | Vital signs monitor | [ca520d85a15e0a7b](https://gemini.google.com/app/ca520d85a15e0a7b) | White and pale blue, probe holder on one side, hose holster on the other, carry handle. |
| 6 | ECG recorder | [5cd101962274f59e](https://gemini.google.com/app/5cd101962274f59e) | Flat off-white unit with keyboard, screen and printer slot. A faint mark near the printer may be lettering; check at full size. |
| 7 | Suction unit | [9e8caa656275de1c](https://gemini.google.com/app/9e8caa656275de1c) | Grey base with gauge, knob and switch, clear canister on the side, carry handle. |
| 8 | Patient hoist | [40a0ee91d6cd7034](https://gemini.google.com/app/40a0ee91d6cd7034) | U-shaped base on castors, mast with battery pack, boom with spreader bar and hooks, hand control. |
| 9 | Hospital bed | [0d9030d98d1098ff](https://gemini.google.com/app/0d9030d98d1098ff) | Blue-grey mattress, grey boards, split rails, castors, handset on a rail. It is shown raised, not at its lowest height; set the height in Blender. |
| 10 | Electrical safety analyser | [aaf5ddeee86b4b56](https://gemini.google.com/app/aaf5ddeee86b4b56) | Dark grey case, colour display, selector, mains socket, coloured jacks, folding handle. The busy front panel may carry lettering; check at full size. |

The pump (prompt in [A2-infusion-pump.md](A2-infusion-pump.md)) is in [a0f579c0995d24c6](https://gemini.google.com/app/a0f579c0995d24c6).
