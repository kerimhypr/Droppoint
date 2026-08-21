/**
 * Client-side WebRTC abstraction
 * - RTCPeerConnection lifecycle
 * - MediaStream / MediaStreamTrack publish
 * - getUserMedia / getDisplayMedia
 * - offer/answer/ICE, renegotiation, reconnect
 * Uses SignalingClient for SDP/ICE trickle (opcode 9 VOICE_SIGNAL)
 */
import { SignalingClient } from "../signaling/signaling-client";
import { env } from "../../lib/env";

export type WebRTCState = "idle" | "acquiring" | "connecting" | "connected" | "reconnecting" | "failed" | "closed";
export type PublishKind = "audio" | "video" | "screen";

export interface RemoteParticipant {
  id: string;
  stream: MediaStream;
  kind: PublishKind;
  muted?: boolean;
  videoEnabled?: boolean;
}

type Listener<T> = (data: T) => void;

export class WebRTCManager {
  private pc: RTCPeerConnection | null = null;
  private localStreams = new Map<PublishKind, MediaStream>();
  private remoteParticipants = new Map<string, RemoteParticipant>();
  private state: WebRTCState = "idle";
  private iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];
  private listeners = new Map<string, Set<Listener<unknown>>>();
  private signalingUnsub: (() => void) | null = null;

  constructor(private signaling: SignalingClient) {
    if (env.turnUrl) {
      this.iceServers.push({
        urls: env.turnUrl,
        username: env.turnUsername,
        credential: env.turnCredential,
      });
    }
  }

  on<K extends string>(event: K, fn: Listener<unknown>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)!.delete(fn);
  }
  private emit(event: string, data: unknown): void {
    this.listeners.get(event)?.forEach((fn) => { try { (fn as Listener<unknown>)(data); } catch { /* */ } });
  }
  private setState(s: WebRTCState): void { if (this.state !== s) { this.state = s; this.emit("state", s); } }

  get connectionState(): WebRTCState { return this.state; }
  get localAudioStream(): MediaStream | undefined { return this.localStreams.get("audio"); }
  get localVideoStream(): MediaStream | undefined { return this.localStreams.get("video"); }
  get localScreenStream(): MediaStream | undefined { return this.localStreams.get("screen"); }

  private ensurePeer(): RTCPeerConnection {
    if (this.pc) return this.pc;
    this.pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
    });

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.signaling.sendVoiceSignal({ type: "candidate", candidate: ev.candidate.toJSON() });
      }
    };
    this.pc.onconnectionstatechange = () => {
      const cs = this.pc?.connectionState;
      if (cs === "connected") this.setState("connected");
      else if (cs === "connecting") this.setState("connecting");
      else if (cs === "failed") { this.setState("failed"); void this.restartIce(); }
      else if (cs === "disconnected") this.setState("reconnecting");
      else if (cs === "closed") this.setState("closed");
      this.emit("connectionstate", cs);
    };
    this.pc.oniceconnectionstatechange = () => {
      if (this.pc?.iceConnectionState === "failed") void this.restartIce();
      this.emit("ice", this.pc?.iceConnectionState);
    };
    this.pc.ontrack = (ev) => {
      const stream = ev.streams[0] ?? new MediaStream([ev.track]);
      const kind: PublishKind = ev.track.kind === "video" ? "video" : "audio";
      // Use transceiver mid or track id as participant key
      const id = (ev.transceiver.mid ?? ev.track.id) || crypto.randomUUID();
      this.remoteParticipants.set(id, { id, stream, kind });
      this.emit("remoteTrack", { id, stream, kind, track: ev.track });
      ev.track.onended = () => {
        this.remoteParticipants.delete(id);
        this.emit("remoteTrackEnded", { id });
      };
    };
    this.pc.onnegotiationneeded = async () => {
      // renegotiation after adding tracks
      try {
        const offer = await this.pc!.createOffer();
        await this.pc!.setLocalDescription(offer);
        this.signaling.sendVoiceSignal({ type: "offer", sdp: this.pc!.localDescription ?? offer });
      } catch { /* ignore */ }
    };
    return this.pc;
  }

  async joinVoice(channelId: string, options: { audio: boolean; video: boolean } = { audio: true, video: false }): Promise<void> {
    this.setState("acquiring");
    // attach signaling listener for answers/candidates/remote offers
    if (!this.signalingUnsub) {
      this.signalingUnsub = this.signaling.on("dispatch", ((event: unknown, data: unknown) => {
        // VOICE_SERVER_UPDATE or raw VOICE_SIGNAL forwarded
        const d = data as { type?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit } | undefined;
        if (!d || !d.type) return;
        void this.handleSignal(d as { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit });
      }) as never);
    }

    if (options.audio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { channelCount: 1, sampleRate: 48000, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
          video: false,
        });
        this.localStreams.set("audio", stream);
      } catch (e) {
        this.setState("failed");
        throw new Error(`Microphone permission failed: ${(e as Error).message}`);
      }
    }
    if (options.video) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        this.localStreams.set("video", stream);
      } catch (e) {
        // video is optional, don't fail whole join
        console.warn("camera permission denied", e);
      }
    }

    const pc = this.ensurePeer();
    // add tracks
    for (const [, stream] of this.localStreams) {
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
    }

    this.setState("connecting");
    // notify gateway we want to join
    this.signaling.sendVoiceSignal({ type: "join", channel_id: channelId });
    // create initial offer
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    this.signaling.sendVoiceSignal({ type: "offer", sdp: pc.localDescription ?? offer });
  }

  async handleSignal(signal: { type: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit }): Promise<void> {
    const pc = this.ensurePeer();
    try {
      if (signal.type === "offer" && signal.sdp) {
        await pc.setRemoteDescription(signal.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        this.signaling.sendVoiceSignal({ type: "answer", sdp: pc.localDescription ?? answer });
      } else if (signal.type === "answer" && signal.sdp) {
        await pc.setRemoteDescription(signal.sdp);
      } else if (signal.type === "candidate" && signal.candidate) {
        await pc.addIceCandidate(signal.candidate);
      }
    } catch (e) {
      console.error("WebRTC handleSignal failed", e);
      this.emit("error", e);
    }
  }

  async startCamera(): Promise<MediaStream> {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: "user" }, audio: false });
    this.localStreams.set("video", stream);
    const pc = this.ensurePeer();
    for (const track of stream.getVideoTracks()) {
      pc.addTrack(track, stream);
    }
    // renegotiation will fire automatically, but force if needed
    return stream;
  }

  stopCamera(): void {
    const s = this.localStreams.get("video");
    if (s) {
      s.getTracks().forEach((t) => { t.stop(); try { this.pc?.getSenders().find((sender)=>sender.track===t)?.replaceTrack(null as unknown as MediaStreamTrack); } catch { /* */ } });
      this.localStreams.delete("video");
    }
  }

  async startScreenShare(): Promise<MediaStream> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: "monitor" }, audio: true });
    } catch (e) {
      throw new Error(`Screen share rejected: ${(e as Error).message}`);
    }
    this.localStreams.set("screen", stream);
    const pc = this.ensurePeer();
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => {
        this.stopScreenShare();
        this.emit("screenEnded", {});
      });
      pc.addTrack(track, stream);
    }
    return stream;
  }

  stopScreenShare(): void {
    const s = this.localStreams.get("screen");
    if (s) {
      s.getTracks().forEach((t) => { t.stop(); });
      this.localStreams.delete("screen");
      this.emit("screenEnded", {});
    }
  }

  setMicrophoneEnabled(enabled: boolean): void {
    const s = this.localStreams.get("audio");
    if (s) s.getAudioTracks().forEach((t) => (t.enabled = enabled));
    this.emit("mute", { enabled });
  }

  setCameraEnabled(enabled: boolean): void {
    const s = this.localStreams.get("video");
    if (s) s.getVideoTracks().forEach((t) => (t.enabled = enabled));
    // also signal presence via gateway if needed
  }

  private async restartIce(): Promise<void> {
    if (!this.pc) return;
    try {
      const offer = await this.pc.createOffer({ iceRestart: true });
      await this.pc.setLocalDescription(offer);
      this.signaling.sendVoiceSignal({ type: "offer", sdp: this.pc.localDescription ?? offer });
      this.setState("reconnecting");
    } catch { /* ignore */ }
  }

  getRemoteParticipants(): RemoteParticipant[] {
    return [...this.remoteParticipants.values()];
  }

  leave(): void {
    try { this.signaling.sendVoiceSignal({ type: "leave" }); } catch { /* ignore */ }
    for (const [, s] of this.localStreams) s.getTracks().forEach((t) => t.stop());
    this.localStreams.clear();
    this.remoteParticipants.clear();
    if (this.signalingUnsub) { this.signalingUnsub(); this.signalingUnsub = null; }
    if (this.pc) {
      try { this.pc.getSenders().forEach((s) => { try { s.track?.stop(); } catch { /* */ } }); } catch { /* */ }
      this.pc.close();
      this.pc = null;
    }
    this.setState("closed");
  }

  dispose(): void { this.leave(); }
}
