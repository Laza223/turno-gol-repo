# Notification sounds

Drop a short (≤1 sec) MP3/WAV chime here named `notification.mp3` before
production. The Service Worker (`public/sw.js`) and admin layout play this
when a new booking confirmation arrives.

Suggested source: freesound.org (CC0) or `sox -n -r 44100 -c 1 notification.wav synth 0.2 sine 880`.

Bundle <30KB recommended.
