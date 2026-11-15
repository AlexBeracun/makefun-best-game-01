# Lanternkeeper — Last Light of the Shore

A 2D canvas arena game. You are the keeper of a lighthouse on a night island.
Moth-shadows swarm from the dark to snuff the light. Hold it through 10 waves —
then dawn breaks.

## How to play

- **Move** with WASD or the arrow keys.
- **Aim** with the mouse, **hold click** to fire bolts of light. No mouse? Space
  fires at the nearest moth.
- **P** pauses, **M** mutes, **N** starts the next wave early.
- Moths drop **embers**. Between waves, spend them in the shop (keys 1–6 or
  click): brighter bolts, faster fire, swift boots, reinforced glass, twin
  flame, repairs for the lighthouse.
- **Bosses** on waves 5 (the Gloom Moth) and 10 (the Moth Queen, who throws
  dark orbs and calls moths to her side).
- The light goes out — or you do — and the night wins. Survive wave 10 and
  dawn breaks.

## Screens

Title → play (HUD: score, wave, lighthouse and keeper health, embers, moths
left, boss bar) → shop between waves → victory results or game over, each
with a restart.

## Tech

Vanilla JavaScript, no libraries, no build step, no network requests. Sound
is synthesised live with WebAudio — no audio files. The game is deterministic
under a seed: `?seed=N` fixes the night, and `?shot=start|play|victory|defeat`
stages a screenshot scene with an autopilot playing the real rules.

Serve it with `node serve.ts` and open http://localhost:8080.
