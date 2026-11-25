// Live voice streaming from the Town Hall stage using WebRTC (audio only).
// The performer opens one peer connection per listener; the game server only relays signalling.
// For big crowds, swap this mesh for an SFU (e.g. LiveKit, mediasoup) — see README.

export class LiveAudio {
  constructor(send, ice) {
    this.send = send;
    this.ice = ice;
    this.peers = new Map(); // performer side: listenerId -> RTCPeerConnection
    this.stream = null;
    this.listen = null; // listener side: { performerId, pc, audio }
    this.muted = false;
    this.volume = 1;
  }

  // ---------- Performer ----------
  async startMic() {
    if (this.stream) return this.stream;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    return this.stream;
  }
  stopMic() {
    for (const pc of this.peers.values()) pc.close();
    this.peers.clear();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
  get live() { return !!this.stream; }

  // ---------- Listener ----------
  request(performerId) {
    if (this.listen?.performerId === performerId) return;
    this.stopListening();
    this.listen = { performerId, pc: null, audio: null, requestedAt: performance.now() };
    this.send({ t: 'rtc', to: performerId, data: { type: 'want' } });
  }
  stopListening() {
    if (!this.listen) return;
    this.listen.pc?.close();
    if (this.listen.audio) { this.listen.audio.srcObject = null; this.listen.audio.remove(); }
    this.listen = null;
  }
  setMuted(m) { this.muted = m; if (this.listen?.audio) this.listen.audio.muted = m; }
  setVolume(v) { this.volume = v; if (this.listen?.audio) this.listen.audio.volume = Math.max(0, Math.min(1, v)); }

  newPc(peerId) {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    pc.onicecandidate = (e) => e.candidate && this.send({ t: 'rtc', to: peerId, data: { type: 'ice', c: e.candidate.toJSON() } });
    return pc;
  }

  async onSignal(from, data, iAmPerformer) {
    try {
      if (iAmPerformer) {
        if (data.type === 'want') {
          if (!this.stream) return;
          this.peers.get(from)?.close();
          const pc = this.newPc(from);
          this.peers.set(from, pc);
          for (const track of this.stream.getTracks()) pc.addTrack(track, this.stream);
          pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(pc.connectionState)) this.peers.delete(from); };
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          this.send({ t: 'rtc', to: from, data: { type: 'offer', sdp: pc.localDescription.sdp } });
        } else if (data.type === 'answer') await this.peers.get(from)?.setRemoteDescription({ type: 'answer', sdp: data.sdp });
        else if (data.type === 'ice') await this.peers.get(from)?.addIceCandidate(data.c);
      } else {
        if (!this.listen || this.listen.performerId !== from) return;
        if (data.type === 'offer') {
          const pc = this.newPc(from);
          this.listen.pc = pc;
          pc.ontrack = (e) => {
            const audio = this.listen.audio || document.createElement('audio');
            audio.autoplay = true;
            audio.srcObject = e.streams[0];
            audio.muted = this.muted;
            audio.volume = this.volume;
            document.body.appendChild(audio);
            this.listen.audio = audio;
            audio.play().catch(() => {});
          };
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          this.send({ t: 'rtc', to: from, data: { type: 'answer', sdp: pc.localDescription.sdp } });
        } else if (data.type === 'ice') await this.listen.pc?.addIceCandidate(data.c);
      }
    } catch (e) {
      console.warn('[live]', e);
    }
  }
}
