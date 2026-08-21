import { create } from "zustand";
import { WebRTCManager, type WebRTCState } from "../services/webrtc/webrtc-manager";
import { signalingClient } from "../services/signaling/signaling-client";
import { AudioEngine } from "../audio/audio-engine";

export interface Participant {
  id: string;
  username: string;
  avatarUrl: string | null;
  muted: boolean;
  deafened?: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  speaking: boolean;
  connectionState: WebRTCState;
  stream?: MediaStream;
}

interface VoiceState {
  channelId: string | null;
  state: WebRTCState;
  muted: boolean;
  deafened: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  participants: Participant[];
  error: string | null;
  speakingLevel: number;
  join: (channelId: string, opts?: { video?: boolean }) => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleCamera: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  _manager: WebRTCManager | null;
  _audioEngine: AudioEngine | null;
}

let manager: WebRTCManager | null = null;
let audioEngine: AudioEngine | null = null;

export const useVoiceStore = create<VoiceState>((set, get) => ({
  channelId: null,
  state: "idle",
  muted: false,
  deafened: false,
  cameraOn: false,
  screenSharing: false,
  participants: [],
  error: null,
  speakingLevel: 0,
  _manager: null,
  _audioEngine: null,

  join: async (channelId, opts) => {
    if (get().channelId === channelId && get().state === "connected") return;
    // cleanup previous
    get().leave();
    set({ channelId, state: "acquiring", error: null });
    // ensure signaling connected
    if (signalingClient.connectionState !== "connected") {
      try { await signalingClient.connect(); } catch (e) { set({ error: (e as Error).message, state: "failed" }); throw e; }
    }

    manager = new WebRTCManager(signalingClient);
    audioEngine = new AudioEngine();

    manager.on("state", (s) => set({ state: s as WebRTCState }));
    manager.on("remoteTrack", (data) => {
      const d = data as { id: string; stream: MediaStream; kind: string };
      set((s) => {
        const exists = s.participants.find((p) => p.id === d.id);
        if (exists) return s;
        const p: Participant = {
          id: d.id, username: `User ${d.id.slice(0,4)}`, avatarUrl: null,
          muted: false, cameraOn: d.kind === "video", screenSharing: d.kind === "screen", speaking: false, connectionState: "connected", stream: d.stream,
        };
        return { participants: [...s.participants, p] };
      });
      // connect remote to audioEngine for deafen handling
      try { audioEngine?.connectRemoteStream(d.stream); } catch { /* */ }
    });
    manager.on("remoteTrackEnded", (data) => {
      const d = data as { id: string };
      set((s) => ({ participants: s.participants.filter((p) => p.id !== d.id) }));
    });
    manager.on("screenEnded", () => set({ screenSharing: false }));

    try {
      // start audio engine processed track (WASM DSP) — fallback to raw if wasm fails
      try {
        await audioEngine.start("/wasm/noise-suppression.wasm", {
          onLevel: (ev) => {
            set({ speakingLevel: ev.rms });
            // update self speaking
            set((s) => ({ participants: s.participants.map((p) => p.id === "self" ? { ...p, speaking: ev.speaking } : p) }));
          },
        });
      } catch (e) {
        console.warn("AudioEngine start failed, fallback to raw getUserMedia", e);
      }

      await manager.joinVoice(channelId, { audio: true, video: !!opts?.video });
      set({
        state: manager.connectionState,
        participants: [{ id: "self", username: "You", avatarUrl: null, muted: false, cameraOn: !!opts?.video, screenSharing: false, speaking: false, connectionState: "connected", stream: manager.localAudioStream }],
        _manager: manager,
        _audioEngine: audioEngine,
        cameraOn: !!opts?.video,
      });

      // join signaling room (opcode 9 join)
      await signalingClient.joinRoom(channelId);

      // listen for VOICE_STATE_UPDATE to sync participants mute/camera
      const unsub = signalingClient.on("dispatch", ((event: string, data: unknown) => {
        if (event === "VOICE_STATE_UPDATE") {
          const d = data as { user_id: string; channel_id: string; muted?: boolean; deafened?: boolean; camera?: boolean; screen?: boolean; username?: string };
          if (!d?.user_id) return;
          set((s) => {
            const existing = s.participants.find((p) => p.id === d.user_id);
            if (existing) {
              return { participants: s.participants.map((p) => p.id === d.user_id ? { ...p, muted: d.muted ?? p.muted, cameraOn: d.camera ?? p.cameraOn, screenSharing: d.screen ?? p.screenSharing } : p) };
            }
            if (d.channel_id === channelId && d.user_id !== "self") {
              return { participants: [...s.participants, { id: d.user_id, username: d.username ?? d.user_id.slice(0,6), avatarUrl: null, muted: !!d.muted, cameraOn: !!d.camera, screenSharing: !!d.screen, speaking: false, connectionState: "connected" }] };
            }
            return s;
          });
        }
      }) as never);
      // store unsub for leave cleanup
      (manager as unknown as { _voiceUnsub?: ()=>void })._voiceUnsub = unsub;
    } catch (e) {
      const msg = (e as Error).message;
      let friendly = msg;
      if (msg.includes("Microphone")) friendly = "Mikrofon izni reddedildi. Tarayıcı ayarlarından izin verin.";
      else if (msg.includes("Screen")) friendly = "Ekran paylaşımı iptal edildi.";
      else if (msg.includes("signaling")) friendly = "Ses sunucusuna bağlanılamadı.";
      set({ error: friendly, state: "failed" });
      throw e;
    }
  },

  leave: () => {
    const m = get()._manager ?? manager;
    const ae = get()._audioEngine ?? audioEngine;
    try { (m as unknown as { _voiceUnsub?: ()=>void })?._voiceUnsub?.(); } catch { /* */ }
    try { m?.leave(); } catch { /* */ }
    try { void ae?.stop(); } catch { /* */ }
    manager = null;
    audioEngine = null;
    try { void signalingClient.leaveRoom(); } catch { /* */ }
    set({ channelId: null, state: "closed", participants: [], muted: false, deafened: false, cameraOn: false, screenSharing: false, _manager: null, _audioEngine: null });
    // after short delay go idle so UI can show disconnected
    setTimeout(() => set({ state: "idle" }), 600);
  },

  toggleMute: () => {
    const muted = !get().muted;
    get()._manager?.setMicrophoneEnabled(!muted);
    get()._audioEngine?.setMuted(muted);
    set({ muted, participants: get().participants.map((p) => p.id === "self" ? { ...p, muted } : p) });
    try { signalingClient.sendVoiceSignal({ type: "mute", muted }); } catch { /* */ }
  },

  toggleDeafen: () => {
    const deafened = !get().deafened;
    get()._audioEngine?.setDeafened(deafened);
    set({ deafened });
  },

  toggleCamera: async () => {
    const on = get().cameraOn;
    if (on) {
      get()._manager?.stopCamera();
      set({ cameraOn: false, participants: get().participants.map((p) => p.id === "self" ? { ...p, cameraOn: false } : p) });
    } else {
      try {
        await get()._manager?.startCamera();
        set({ cameraOn: true, participants: get().participants.map((p) => p.id === "self" ? { ...p, cameraOn: true } : p) });
      } catch (e) {
        set({ error: "Kamera izni reddedildi." });
        throw e;
      }
    }
  },

  toggleScreenShare: async () => {
    const sharing = get().screenSharing;
    if (sharing) {
      get()._manager?.stopScreenShare();
      set({ screenSharing: false, participants: get().participants.map((p) => p.id === "self" ? { ...p, screenSharing: false } : p) });
    } else {
      try {
        await get()._manager?.startScreenShare();
        set({ screenSharing: true, participants: get().participants.map((p) => p.id === "self" ? { ...p, screenSharing: true } : p) });
      } catch (e) {
        set({ error: (e as Error).message });
        throw e;
      }
    }
  },
}));
