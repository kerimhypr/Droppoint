import { Opcode } from "@clone/contracts";

export interface VoiceSignal {
  type: "offer" | "answer" | "candidate" | "join" | "leave";
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  channel_id?: string;
}

export class VoiceClient {
  private readonly peer: RTCPeerConnection;
  private readonly sendSignal: (signal: VoiceSignal) => void;

  constructor(
    iceServers: RTCIceServer[],
    sendSignal: (signal: VoiceSignal) => void,
    onRemoteTrack: (stream: MediaStream) => void
  ) {
    this.sendSignal = sendSignal;
    this.peer = new RTCPeerConnection({ iceServers, bundlePolicy: "max-bundle", rtcpMuxPolicy: "require" });
    this.peer.onicecandidate = (event) => {
      if (event.candidate) this.sendSignal({ type: "candidate", candidate: event.candidate.toJSON() });
    };
    this.peer.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      onRemoteTrack(stream);
    };
    this.peer.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(this.peer.connectionState)) void this.close();
    };
  }

  async publishTrack(track: MediaStreamTrack): Promise<void> {
    this.peer.addTrack(track, new MediaStream([track]));
    const offer = await this.peer.createOffer({ offerToReceiveAudio: true });
    await this.peer.setLocalDescription(offer);
    this.sendSignal({ type: "offer", sdp: this.peer.localDescription ?? offer });
  }

  async acceptSignal(signal: VoiceSignal): Promise<void> {
    if (signal.type === "offer" && signal.sdp) {
      await this.peer.setRemoteDescription(signal.sdp);
      const answer = await this.peer.createAnswer();
      await this.peer.setLocalDescription(answer);
      this.sendSignal({ type: "answer", sdp: this.peer.localDescription ?? answer });
    } else if (signal.type === "answer" && signal.sdp) {
      await this.peer.setRemoteDescription(signal.sdp);
    } else if (signal.type === "candidate" && signal.candidate) {
      await this.peer.addIceCandidate(signal.candidate);
    }
  }

  join(channelId: string): void {
    this.sendSignal({ type: "join", channel_id: channelId });
  }

  async close(): Promise<void> {
    this.sendSignal({ type: "leave" });
    this.peer.getSenders().forEach((sender) => sender.track?.stop());
    this.peer.close();
  }

  static gatewayEnvelope(signal: VoiceSignal): { op: Opcode; d: VoiceSignal } {
    return { op: Opcode.VOICE_SIGNAL, d: signal };
  }
}
