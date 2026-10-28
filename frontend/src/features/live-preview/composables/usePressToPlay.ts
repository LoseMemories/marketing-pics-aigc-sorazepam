import { onBeforeUnmount, ref, type Ref } from "vue";

export function usePressToPlay(video: Ref<HTMLVideoElement | undefined>) {
  const isPlaying = ref(false);
  const currentTimeMs = ref(0);
  let animationFrame: number | undefined;

  function updateTime(): void {
    currentTimeMs.value = (video.value?.currentTime ?? 0) * 1000;
    if (isPlaying.value) animationFrame = requestAnimationFrame(updateTime);
  }

  async function play(restart = true): Promise<void> {
    if (!video.value) return;
    if (restart) video.value.currentTime = 0;
    try {
      await video.value.play();
      isPlaying.value = true;
      cancelAnimationFrame(animationFrame ?? 0);
      animationFrame = requestAnimationFrame(updateTime);
    } catch {
      isPlaying.value = false;
    }
  }

  function stop(): void {
    if (video.value) {
      video.value.pause();
      video.value.currentTime = 0;
    }
    isPlaying.value = false;
    currentTimeMs.value = 0;
    cancelAnimationFrame(animationFrame ?? 0);
  }

  async function toggle(): Promise<void> {
    if (isPlaying.value) stop();
    else await play(true);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    void play(true);
  }

  function onPointerUp(): void {
    stop();
  }

  onBeforeUnmount(stop);

  return { isPlaying, currentTimeMs, play, stop, toggle, onPointerDown, onPointerUp };
}
