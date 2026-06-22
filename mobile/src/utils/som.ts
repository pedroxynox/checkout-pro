/**
 * Utilitário de som para notificações.
 *
 * Usa a Web Audio API (funciona na versão web do Expo/RN). No mobile nativo,
 * se expo-av estiver instalado, pode ser adaptado para usar Audio.Sound.
 *
 * O som é um beep sutil e agradável (frequência 880Hz, duração 150ms).
 */

/** Toca um beep sutil de notificação. */
export function tocarSomNotificacao(): void {
  try {
    if (typeof window === 'undefined' || !window.AudioContext) return;

    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota A5
    gain.gain.setValueAtTime(0.15, ctx.currentTime); // Volume baixo
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);

    // Limpar o contexto após terminar.
    setTimeout(() => void ctx.close(), 200);
  } catch {
    // Silencia erros (ex.: autoplay policy, ambiente SSR).
  }
}

/** Toca um som duplo mais urgente (para alertas). */
export function tocarSomAlerta(): void {
  try {
    if (typeof window === 'undefined' || !window.AudioContext) return;

    const ctx = new AudioContext();

    // Primeiro beep.
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(660, ctx.currentTime);
    gain1.gain.setValueAtTime(0.2, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.12);

    // Segundo beep (mais agudo).
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
    gain2.gain.setValueAtTime(0.2, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.27);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.27);

    setTimeout(() => void ctx.close(), 350);
  } catch {
    // Silencia erros.
  }
}
