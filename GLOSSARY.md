# Anime Episode Checker

Watches streaming providers for newly released anime episodes on a weekly schedule and alerts Discord when one drops.

## Language

### Schedule

**Drop**:
The moment a new episode becomes available on its provider.
_Avoid_: Release, air

**Next drop**:
The next episode expected for a show, together with the time it is expected to drop.
_Avoid_: Next episode, upcoming episode

**Drop window**:
The span around a next drop when the show is actively checked: from 5 minutes before the expected time to 90 minutes after.
_Avoid_: Check window, needs check

**Late slot**:
A check opportunity, every 30 minutes, after the drop window has closed and the expected episode still hasn't appeared.
_Avoid_: Late poll

**Premiere batch**:
The episodes that drop together on a show's first day; every episode after it drops one week apart.

**Break**:
A pause between two episodes that shifts every later drop by its length in weeks; earlier drops stay put. Entered by hand in the schedule, or seen as a gap in AniList's airing schedule.
_Avoid_: Delay, hiatus

**Announced break**:
A break that a show's official sources have announced but that hasn't been confirmed yet. Confirming it makes it a break; dismissing it discards it. It may not have a new date yet.
_Avoid_: Delay, postponement

**Provider lag**:
When an episode has broadcast in Japan but its provider hasn't made it available yet. Unlike a break, it doesn't shift later drops.
_Avoid_: Delay, late release

### Checking

**Episode snapshot**:
What a provider reports as a show's latest available episode at one moment.
_Avoid_: Latest episode, provider episode

**Baseline**:
The first episode snapshot recorded for a show, taken without sending an alert.

**Still waiting**:
The one-time alert sent when an expected episode is 15 or more minutes past its drop.
_Avoid_: Late alert

**Announcement check**:
A read of a show's official news and Anime News Network for an announced break: in the day after each drop, the 3 days before the next drop, and while that drop is late.
_Avoid_: News check, delay check
