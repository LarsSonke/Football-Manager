import { useEffect, useRef, useState } from 'react';

const playlist = [
  '/Fade_Harperr.mp3',
  '/crunkz_need_you.mp3',
  '/wide_awake_stussy.mp3',
];

const TARGET_VOLUME = 0.03;
const FADE_DURATION = 3000;

export default function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement>(null);

  const [currentSong, setCurrentSong] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.volume = 0;

    const fadeIn = () => {
      const step = TARGET_VOLUME / 60;

      const interval = window.setInterval(() => {
        if (audio.volume >= TARGET_VOLUME) {
          audio.volume = TARGET_VOLUME;
          clearInterval(interval);
        } else {
          audio.volume = Math.min(audio.volume + step, TARGET_VOLUME);
        }
      }, FADE_DURATION / 60);
    };

    const fadeOut = (callback: () => void) => {
      const step = TARGET_VOLUME / 60;

      const interval = window.setInterval(() => {
        if (audio.volume <= 0.001) {
          audio.volume = 0;
          clearInterval(interval);
          callback();
        } else {
          audio.volume = Math.max(audio.volume - step, 0);
        }
      }, FADE_DURATION / 60);
    };

    const startMusic = () => {
      audio.play().then(fadeIn).catch(() => {});
      document.removeEventListener('click', startMusic);
    };

    document.addEventListener('click', startMusic);

    const handleEnded = () => {
      fadeOut(() => {
        let next = currentSong;

        while (next === currentSong) {
          next = Math.floor(Math.random() * playlist.length);
        }

        setCurrentSong(next);
      });
    };

    audio.addEventListener('ended', handleEnded);

    return () => {
      document.removeEventListener('click', startMusic);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [currentSong]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.load();

    audio.play().then(() => {
      audio.volume = 0;

      const step = TARGET_VOLUME / 60;

      const interval = window.setInterval(() => {
        if (audio.volume >= TARGET_VOLUME) {
          audio.volume = TARGET_VOLUME;
          clearInterval(interval);
        } else {
          audio.volume += step;
        }
      }, FADE_DURATION / 60);
    }).catch(() => {});
  }, [currentSong]);

  return (
    <audio
      ref={audioRef}
      src={playlist[currentSong]}
      preload="auto"
    />
  );
}